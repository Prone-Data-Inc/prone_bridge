import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { applySeed } from './seed/apply.js'
import { buildSeed } from './seed/build.js'
import { createTestDb } from './testing.js'

const ALLOWED = ['table', 'op', 'id', 'merchantId', 'buyerId', 'status', 'audience', 'kind']

describe('live signals', () => {
  let db
  let payment

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    ;[payment] = await db.query(
      "select id, merchant_id, buyer_id from public.payments where status = 'succeeded' limit 1",
    )
  })
  afterAll(() => db.close())

  beforeEach(() => db.query('delete from realtime.sent'))

  const sent = () => db.query('select payload, event, topic, private from realtime.sent order by id')

  it('broadcasts a payment update on the public channel', async () => {
    await db.query("update public.payments set status = 'refunded' where id = $1", [payment.id])
    const [signal] = await sent()

    expect(signal.event).toBe('change')
    expect(signal.topic).toBe('pb:events')
    expect(signal.private).toBe(false)
    expect(signal.payload).toEqual({
      table: 'payments',
      op: 'UPDATE',
      id: payment.id,
      merchantId: payment.merchant_id,
      buyerId: payment.buyer_id,
      status: 'refunded',
    })
  })

  it('broadcasts a new payment, and a new payout', async () => {
    const [source] = await db.query('select * from public.payments where id = $1', [payment.id])
    await db.query(
      `insert into public.payments (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency, display_amount_minor, fx_rate, status, provider)
       values ('pb_TESTSIGNAL01', $1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing', 'simulated')`,
      [
        source.merchant_id,
        source.product_id,
        source.buyer_id,
        source.method_id,
        source.country_code,
        source.amount_usd_cents,
        source.display_currency,
        source.display_amount_minor,
        source.fx_rate,
      ],
    )
    await db.query(
      "insert into public.payouts (reference, merchant_id, amount_usd_cents, status, provider) values ('po_TESTSIGNAL01', $1, 1000, 'processing', 'simulated')",
      [source.merchant_id],
    )
    const signals = await sent()
    expect(signals.map((s) => `${s.payload.table}:${s.payload.op}:${s.payload.status}`)).toEqual([
      'payments:INSERT:processing',
      'payouts:INSERT:processing',
    ])
  })

  it('broadcasts when a risk assessment is written or changed, without a score, a level or a note', async () => {
    const [{ id: paymentId }] = await db.query(
      'select p.id from public.payments p where not exists (select 1 from public.risk_assessments r where r.payment_id = p.id) limit 1',
    )
    const [{ id }] = await db.query(
      `insert into public.risk_assessments (payment_id, score, level, decision, signals, explanation, explanation_source, engine)
       values ($1, 40, 'medium', 'review', '[{"id":"x"}]'::jsonb, 'Held for review.', 'rules', 'rules-1') returning id`,
      [paymentId],
    )
    await db.query(
      "update public.risk_assessments set explanation = 'A new note.', explanation_source = 'ai' where id = $1",
      [id],
    )
    const signals = await sent()
    expect(signals.map((s) => s.payload)).toEqual([
      { table: 'risk_assessments', op: 'INSERT', id },
      { table: 'risk_assessments', op: 'UPDATE', id },
    ])
    for (const signal of signals) {
      expect(Object.keys(signal.payload).every((key) => ALLOWED.includes(key))).toBe(true)
      expect(JSON.stringify(signal.payload)).not.toMatch(/medium|score|note|Held/)
    }
  })

  it('broadcasts a notification with who it is for', async () => {
    await db.query(
      "insert into public.notifications (audience, kind, title, body) values ('admin', 'review.needed', 'Review', 'Look')",
    )
    const [signal] = await sent()
    expect(signal.payload).toMatchObject({
      table: 'notifications',
      op: 'INSERT',
      audience: 'admin',
      kind: 'review.needed',
    })
  })

  it('carries ids and status only: never a name, an email or an amount', async () => {
    await db.query("update public.payments set status = 'succeeded' where id = $1", [payment.id])
    await db.query(
      "insert into public.notifications (audience, buyer_id, kind, title, body) values ('buyer', $1, 'payment.ok', 'Paid for Ada Lovelace', 'ada@example.com')",
      [payment.buyer_id],
    )
    for (const { payload } of await sent()) {
      expect(Object.keys(payload).every((key) => ALLOWED.includes(key))).toBe(true)
      expect(JSON.stringify(payload)).not.toMatch(/@|Ada|amount|display|email/i)
    }
  })

  it('does not signal a deleted or unchanged table', async () => {
    await db.query("update public.merchants set tagline = tagline where slug = 'pdl'")
    expect(await sent()).toEqual([])
  })

  it('never blocks the write when the broadcast fails', async () => {
    await db.exec(`
      create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$;
    `)
    await db.query("update public.payments set status = 'succeeded' where id = $1", [payment.id])
    const [row] = await db.query('select status from public.payments where id = $1', [payment.id])
    expect(row.status).toBe('succeeded')
    await db.query(
      "insert into public.notifications (audience, kind, title, body) values ('admin', 'still.works', 'Ok', 'Ok')",
    )
    expect((await db.query("select 1 from public.notifications where kind = 'still.works'")).length).toBe(1)
  })
})
