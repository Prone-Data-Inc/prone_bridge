/* Fraud checks end to end: every payment is scored before money moves, medium waits for a person, high is blocked, the AI
   only words the note, and nothing about who or where a buyer is can change a score. Real routes on an in-memory Postgres
   with the demo data, with stand-ins for PayPal and for the AI. */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { RISK_INPUTS, scoreRisk } from './lib/risk.js'
import { createRiskRepository } from './repositories/risk.repository.js'
import { createRiskService } from './services/risk.service.js'

const logger = createLogger({ level: 'silent' })
/* The key is built at run time so this file holds nothing shaped like a secret. */
const env = loadEnv({ NODE_ENV: 'test', OPENAI_API_KEY: ['test', 'key'].join('-') })
const LONG_DASH = String.fromCharCode(0x2014)

function fakePaypal() {
  let sequence = 0
  return {
    enabled: true,
    clientToken: vi.fn(),
    createOrder: vi.fn(async () => ({ id: `ORDER${++sequence}`, status: 'CREATED' })),
    captureOrder: vi.fn(),
    getOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    createPayout: vi.fn(),
    getPayout: vi.fn(),
  }
}

/* What the AI sends back when asked for a note. */
const note = (explanation) => ({
  text: JSON.stringify({ explanation }),
  parsed: { explanation },
  refusal: null,
  calls: [],
  output: [],
  usage: { inputTokens: 120, outputTokens: 30 },
  status: 'completed',
  incomplete: null,
  model: 'fast-model',
})

function fakeOpenAi() {
  return {
    enabled: true,
    models: { agent: 'agent-model', fast: 'fast-model' },
    respond: vi.fn(),
  }
}

describe('fraud checks', () => {
  let db
  let app
  let paypal
  let openai

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    paypal = fakePaypal()
    openai = fakeOpenAi()
    app = createApp({ env, logger, db, paypal, openai })
  })
  afterAll(() => db.close())

  /* Tests run in seconds, so one test's payments would sit inside the next test's two minute window. Each test starts with
     everything before it a day old. */
  beforeEach(async () => {
    await db.query(
      "update public.payments set created_at = created_at - interval '1 day' where created_at > now() - interval '1 day'",
    )
    paypal.createOrder.mockClear()
    openai.respond.mockReset().mockResolvedValue(note('The signals suggest a throwaway email address was used.'))
  })

  let address = 0
  const call = async (path, init = {}) => {
    address += 1
    const headers = {
      ...init.headers,
      'x-forwarded-for': `10.${address >> 16}.${(address >> 8) & 255}.${address & 255}`,
    }
    const response = await app.request(path, { ...init, headers })
    return { status: response.status, body: await response.json() }
  }
  const send = (method) => (path, body) =>
    call(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const post = send('POST')
  const one = async (sql, params) => (await db.query(sql, params))[0]
  const count = async (table, where = 'true', params = []) =>
    (await one(`select count(*)::int as n from public.${table} where ${where}`, params)).n

  let n = 0
  const order = (over = {}) => ({
    idempotencyKey: randomUUID(),
    product: 'ai-for-work',
    country: 'CI',
    method: 'mobile_money',
    buyer: { name: 'Aminata Diallo', email: `aminata.${++n}.${randomUUID().slice(0, 8)}@example.com` },
    ...over,
  })
  const throwaway = () => ({ name: 'Test Buyer', email: `buyer.${++n}.${randomUUID().slice(0, 8)}@mailinator.com` })
  const make = async (over) => (await post('/api/checkout/payments', order(over))).body.data
  const assessmentOf = (paymentId) => one('select * from public.risk_assessments where payment_id = $1', [paymentId])
  const notificationsOf = (paymentId) =>
    db.query(
      'select audience, kind, level, title, body from public.notifications where payment_id = $1 order by audience, kind',
      [paymentId],
    )

  /* A buyer with a past, written straight into the database. */
  async function buyerWithHistory(email, history) {
    const buyer = await one(
      "insert into public.buyers (email, full_name, country_code) values ($1, 'History Buyer', 'CI') returning id",
      [email],
    )
    const merchant = await one("select id from public.merchants where slug = 'pdl'")
    const product = await one('select id from public.products where merchant_id = $1 limit 1', [merchant.id])
    for (const entry of history) {
      await db.query(
        `insert into public.payments
           (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency,
            display_amount_minor, fx_rate, fee_usd_cents, status, failure_code, provider, origin, created_at, completed_at)
         values ($1, $2, $3, $4, $5, 'CI', 4900, 'XOF', 29400, 600, 100, $6, $7, 'simulated', 'app',
                 now() - ($8 || ' minutes')::interval, now())`,
        [
          `hist_${randomUUID().slice(0, 10)}`,
          merchant.id,
          product.id,
          buyer.id,
          entry.method ?? 'mobile_money',
          entry.status,
          entry.code ?? null,
          String(entry.minutesAgo ?? 1),
        ],
      )
    }
    return buyer.id
  }

  describe('a low risk payment', () => {
    it('goes ahead as usual, with a low assessment and no AI call', async () => {
      const { payment } = await make()
      expect(payment.status).toBe('processing')

      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({
        score: 0,
        level: 'low',
        decision: 'allow',
        enforced: true,
        explanation: 'No risk signals fired.',
        explanation_source: 'rules',
      })
      expect(row.signals).toEqual([])
      expect(openai.respond).not.toHaveBeenCalled()
      expect(await count('notifications', "payment_id = $1 and kind like 'risk.%'", [payment.id])).toBe(0)
    })

    it('can still be paid, and unlocks the course', async () => {
      const { payment } = await make()
      const settled = await post(`/api/simulator/payments/${payment.id}/outcome`, { outcome: 'approve' })
      expect(settled.body.data.payment.status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
    })
  })

  describe('a medium risk payment', () => {
    it('is held for review before any money moves', async () => {
      const { payment } = await make({ buyer: throwaway() })
      expect(payment).toMatchObject({ status: 'in_review', failureCode: null, completedAt: null })

      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({ score: 40, level: 'medium', decision: 'review', enforced: true })
      expect(row.signals.map((entry) => entry.id)).toEqual(['throwaway_email'])

      const events = await db.query('select type, actor from public.payment_events where payment_id = $1 order by id', [
        payment.id,
      ])
      expect(events.map((event) => event.type)).toEqual(['created', 'held_for_review'])
    })

    it('tells the buyer, the seller and the admin, each in its own words', async () => {
      const { payment } = await make({ buyer: throwaway() })
      const notes = await notificationsOf(payment.id)
      expect(notes.map((entry) => [entry.audience, entry.kind, entry.level])).toEqual([
        ['admin', 'risk.review', 'warning'],
        ['buyer', 'payment.review', 'info'],
        ['seller', 'risk.review', 'info'],
      ])
      expect(notes.find((entry) => entry.audience === 'buyer').body).toContain('Nothing has been charged')
      expect(notes.find((entry) => entry.audience === 'admin').body).toContain('Throwaway email')
    })

    it('cannot be paid while it waits', async () => {
      const { payment } = await make({ buyer: throwaway() })
      const settled = await post(`/api/simulator/payments/${payment.id}/outcome`, { outcome: 'approve' })
      expect(settled.body.data.payment.status).toBe('in_review')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
    })

    it('makes no PayPal order for a card payment held for review', async () => {
      const { payment, paypal: order } = await make({ method: 'card', buyer: throwaway() })
      expect(payment.status).toBe('in_review')
      expect(order).toBeUndefined()
      expect(paypal.createOrder).not.toHaveBeenCalled()

      const capture = await post(`/api/checkout/payments/${payment.id}/capture`, { orderId: 'ORDER1' })
      expect(capture.status).toBe(400)
    })

    it('gets its order once a person approves it, with the same request', async () => {
      const key = randomUUID()
      const body = order({ idempotencyKey: key, method: 'card', buyer: throwaway() })
      const held = (await post('/api/checkout/payments', body)).body.data
      expect(held.payment.status).toBe('in_review')

      const approved = await post(`/api/admin/review/${held.payment.id}/approve`, { note: 'Checked by hand' })
      expect(approved.status).toBe(200)

      const again = (await post('/api/checkout/payments', body)).body.data
      expect(again.payment.id).toBe(held.payment.id)
      expect(again.payment.status).toBe('requires_payment')
      expect(again.paypal.orderId).toMatch(/^ORDER/)
      expect(paypal.createOrder).toHaveBeenCalledTimes(1)
    })

    it('does not score or notify twice when the same request is repeated', async () => {
      const body = order({ buyer: throwaway() })
      const first = (await post('/api/checkout/payments', body)).body.data.payment
      const second = (await post('/api/checkout/payments', body)).body.data.payment
      expect(second.id).toBe(first.id)
      expect(await count('risk_assessments', 'payment_id = $1', [first.id])).toBe(1)
      expect(await count('notifications', 'payment_id = $1', [first.id])).toBe(3)
      expect(openai.respond).toHaveBeenCalledTimes(1)
    })
  })

  describe('a high risk payment', () => {
    /* A throwaway address, and three payments started in the last few minutes. */
    async function riskyBuyer() {
      const email = `fast.${++n}.${randomUUID().slice(0, 8)}@mailinator.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'insufficient_funds', minutesAgo: 4 },
        { status: 'failed', code: 'insufficient_funds', minutesAgo: 3 },
        { status: 'failed', code: 'insufficient_funds', minutesAgo: 2 },
      ])
      return { name: 'Fast Buyer', email }
    }

    it('is blocked at once, and recorded as finished', async () => {
      const { payment } = await make({ buyer: await riskyBuyer() })
      expect(payment).toMatchObject({
        status: 'blocked',
        failureCode: 'safety_check',
        failureMessage: 'A safety check stopped this payment.',
      })
      expect(payment.completedAt).not.toBeNull()

      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({ score: 60, level: 'high', decision: 'block', enforced: true })
      expect(row.signals.map((entry) => entry.id)).toEqual(['throwaway_email', 'rapid_attempts'])
    })

    it('tells the buyer, the seller and the admin', async () => {
      const { payment } = await make({ buyer: await riskyBuyer() })
      const notes = await notificationsOf(payment.id)
      expect(notes.map((entry) => [entry.audience, entry.kind, entry.level])).toEqual([
        ['admin', 'risk.blocked', 'danger'],
        ['buyer', 'payment.blocked', 'danger'],
        ['seller', 'risk.blocked', 'warning'],
      ])
      expect(notes.find((entry) => entry.audience === 'buyer').body).toBe(
        'A safety check stopped this payment. Nothing was charged.',
      )
    })

    it('can never be paid afterwards', async () => {
      const { payment } = await make({ buyer: await riskyBuyer() })
      const settled = await post(`/api/simulator/payments/${payment.id}/outcome`, { outcome: 'approve' })
      expect(settled.body.data.payment.status).toBe('blocked')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
    })

    it('never shows the buyer a score, a rule or the AI note', async () => {
      const { payment } = await make({ buyer: await riskyBuyer() })
      const fetched = await call(`/api/checkout/payments/${payment.id}`)
      const text = JSON.stringify(fetched.body) + JSON.stringify((await call('/api/notifications?audience=buyer')).body)
      expect(text).not.toMatch(/score|signal|assessment|throwaway|rapid|risk/i)
    })

    it('does not tell the seller why either', async () => {
      const { payment } = await make({ buyer: await riskyBuyer() })
      const seen = await call(`/api/seller/payments/${payment.id}`)
      expect(seen.status).toBe(200)
      expect(JSON.stringify(seen.body)).not.toMatch(/score|signals|assessment|throwaway|rapid_attempts/i)
      expect(seen.body.data.payment.status).toBe('blocked')
      expect(seen.body.data.timeline.map((entry) => entry.label)).toContain('Blocked by a safety check')
    })

    it('is held again, not waved through, when the buyer tries once more', async () => {
      const email = `retry.${++n}.${randomUUID().slice(0, 8)}@example.com`
      await buyerWithHistory(email, [{ status: 'blocked', code: 'safety_check', minutesAgo: 90 }])
      const { payment } = await make({ buyer: { name: 'Retry Buyer', email } })
      expect(payment.status).toBe('in_review')
      expect((await assessmentOf(payment.id)).signals.map((entry) => entry.id)).toEqual(['after_block'])
    })
  })

  describe('what counts as a signal', () => {
    it('counts card and PayPal declines, two of them in an hour, but not enough to hold the payment', async () => {
      const email = `two.${++n}@example.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 20 },
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 15 },
      ])
      const { payment } = await make({ buyer: { name: 'Two Declines', email } })
      expect(payment.status).toBe('processing')
      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({ score: 25, level: 'low' })
      expect(row.signals.map((entry) => entry.id)).toEqual(['repeated_declines'])
    })

    it('holds a third decline', async () => {
      const email = `three.${++n}@example.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 30 },
        { status: 'failed', code: 'paypal_declined', method: 'card', minutesAgo: 20 },
        { status: 'failed', code: 'authentication_failed', method: 'card', minutesAgo: 10 },
      ])
      const { payment } = await make({ buyer: { name: 'Three Declines', email } })
      expect(payment.status).toBe('in_review')
      expect((await assessmentOf(payment.id)).score).toBe(40)
    })

    it('never counts a low balance on a local method, however many times it happened', async () => {
      const email = `broke.${++n}@example.com`
      await buyerWithHistory(
        email,
        Array.from({ length: 6 }, (_, index) => ({
          status: 'failed',
          code: 'insufficient_funds',
          minutesAgo: 30 + index,
        })),
      )
      const { payment } = await make({ buyer: { name: 'Low Balance', email } })
      expect(payment.status).toBe('processing')
      expect((await assessmentOf(payment.id)).signals.map((entry) => entry.id)).not.toContain('repeated_declines')
    })

    it('does not count a payment the buyer cancelled themselves', async () => {
      const email = `cancel.${++n}@example.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'payer_cancelled', method: 'card', minutesAgo: 20 },
        { status: 'failed', code: 'payer_cancelled', method: 'card', minutesAgo: 15 },
        { status: 'failed', code: 'payer_cancelled', method: 'card', minutesAgo: 12 },
      ])
      const { payment } = await make({ buyer: { name: 'Changed Mind', email } })
      expect((await assessmentOf(payment.id)).signals.map((entry) => entry.id)).not.toContain('repeated_declines')
    })

    it('only looks at the last hour', async () => {
      const email = `old.${++n}@example.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 120 },
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 130 },
        { status: 'failed', code: 'card_declined', method: 'card', minutesAgo: 140 },
      ])
      const { payment } = await make({ buyer: { name: 'Old Declines', email } })
      expect((await assessmentOf(payment.id)).score).toBe(0)
    })

    it('sees three methods tried in an hour', async () => {
      const email = `methods.${++n}@example.com`
      await buyerWithHistory(email, [
        { status: 'failed', code: 'insufficient_funds', method: 'card', minutesAgo: 40 },
        { status: 'failed', code: 'insufficient_funds', method: 'paypal', minutesAgo: 30 },
      ])
      const { payment } = await make({ buyer: { name: 'Many Methods', email } })
      expect((await assessmentOf(payment.id)).signals.map((entry) => entry.id)).toEqual(['many_methods'])
    })

    it('sees an earlier refund', async () => {
      const email = `refund.${++n}@example.com`
      await buyerWithHistory(email, [{ status: 'refunded', minutesAgo: 60 * 24 * 3 }])
      const { payment } = await make({ buyer: { name: 'Past Refund', email } })
      expect((await assessmentOf(payment.id)).signals.map((entry) => entry.id)).toEqual(['past_refund'])
    })
  })

  describe('the review queue decisions', () => {
    it('approving lets the buyer finish paying', async () => {
      const { payment } = await make({ buyer: throwaway() })
      const approved = await post(`/api/admin/review/${payment.id}/approve`, { note: 'Called the buyer' })
      expect(approved.status).toBe(200)
      expect(approved.body.data.payment.status).toBe('processing')

      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({ review_decision: 'approved', review_note: 'Called the buyer' })
      expect(row.reviewed_at).not.toBeNull()

      const events = await db.query('select type, actor from public.payment_events where payment_id = $1 order by id', [
        payment.id,
      ])
      expect(events.at(-1)).toEqual({ type: 'review_approved', actor: 'admin' })
      expect(await count('audit_log', "action = 'risk.approved' and entity_id = $1", [payment.id])).toBe(1)
      expect((await notificationsOf(payment.id)).map((entry) => entry.kind)).toContain('payment.cleared')

      const paid = await post(`/api/simulator/payments/${payment.id}/outcome`, { outcome: 'approve' })
      expect(paid.body.data.payment.status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
    })

    it('rejecting blocks it and tells the buyer and the seller', async () => {
      const { payment } = await make({ buyer: throwaway() })
      const rejected = await post(`/api/admin/review/${payment.id}/reject`, {})
      expect(rejected.status).toBe(200)
      expect(rejected.body.data.payment).toMatchObject({ status: 'blocked', failureCode: 'safety_check' })
      expect(rejected.body.data.payment.completedAt).not.toBeNull()

      expect(await assessmentOf(payment.id)).toMatchObject({ review_decision: 'rejected' })
      expect(await count('audit_log', "action = 'risk.rejected' and entity_id = $1", [payment.id])).toBe(1)
      const kinds = (await notificationsOf(payment.id)).map((entry) => entry.kind)
      expect(kinds).toEqual(expect.arrayContaining(['payment.blocked', 'risk.rejected']))
    })

    it('can only be decided once', async () => {
      const { payment } = await make({ buyer: throwaway() })
      expect((await post(`/api/admin/review/${payment.id}/approve`, {})).status).toBe(200)
      expect((await post(`/api/admin/review/${payment.id}/reject`, {})).status).toBe(409)
      expect((await post(`/api/admin/review/${payment.id}/approve`, {})).status).toBe(409)
    })

    it('refuses a payment that is not waiting, an unknown one, a bad id and a long note', async () => {
      const { payment } = await make()
      expect((await post(`/api/admin/review/${payment.id}/approve`, {})).status).toBe(409)
      expect((await post(`/api/admin/review/${randomUUID()}/approve`, {})).status).toBe(404)
      expect((await post('/api/admin/review/not-an-id/approve', {})).status).toBe(400)
      const held = (await make({ buyer: throwaway() })).payment
      expect((await post(`/api/admin/review/${held.id}/reject`, { note: 'x'.repeat(241) })).status).toBe(400)
    })

    it("leaves the seller's sales and what they are owed exactly as they were", async () => {
      const { payment } = await make({ buyer: throwaway() })
      const before = (await call('/api/seller/overview')).body.data
      await post(`/api/admin/review/${payment.id}/reject`, {})
      const after = (await call('/api/seller/overview')).body.data
      expect(after.kpis.payments.value).toBe(before.kpis.payments.value)
      expect(after.kpis.gross.value).toBe(before.kpis.gross.value)
      expect(after.balance).toEqual(before.balance)
      expect(after.kpis.successRate.value).toBe(before.kpis.successRate.value)
    })
  })

  describe('the AI note', () => {
    it('replaces the rules sentence, is marked as AI, and loses any long dash', async () => {
      openai.respond.mockResolvedValue(note(`The signals suggest a throwaway address ${LONG_DASH} worth a look.`))
      const { payment } = await make({ buyer: throwaway() })
      const row = await assessmentOf(payment.id)
      expect(row.explanation_source).toBe('ai')
      expect(row.model).toBe('fast-model')
      expect(row.explanation).toBe('The signals suggest a throwaway address, worth a look.')
      expect(row.explanation).not.toContain(LONG_DASH)
    })

    it('asks the fast model for a fixed JSON shape, with nothing about who the buyer is', async () => {
      const buyer = throwaway()
      await make({ buyer, country: 'SN', method: 'mobile_money' })
      expect(openai.respond).toHaveBeenCalledTimes(1)
      const request = openai.respond.mock.calls[0][0]
      expect(request.model).toBe('fast-model')
      expect(request.schema).toMatchObject({ required: ['explanation'], additionalProperties: false })
      expect(request.effort).toBe('none')

      /* The instructions themselves tell the model never to mention a country, so only the facts it is handed are checked. */
      const sent = request.input.find((message) => message.role === 'user').content
      expect(sent).not.toContain(buyer.email)
      expect(sent).not.toContain(buyer.name)
      expect(sent).not.toMatch(/Senegal|nationality|country|Diallo/i)
      expect(sent).not.toContain('"SN"')
      expect(sent).toContain('Throwaway email')
    })

    it('counts what it spends', async () => {
      const before = await count('ai_usage', "feature = 'risk.explain'")
      await make({ buyer: throwaway() })
      expect(await count('ai_usage', "feature = 'risk.explain'")).toBe(before + 1)
      const row = await one(
        "select input_tokens, output_tokens, model from public.ai_usage where feature = 'risk.explain' order by id desc limit 1",
      )
      expect(row).toEqual({ input_tokens: 120, output_tokens: 30, model: 'fast-model' })
    })

    it('is thrown away if it strays onto who or where the buyer is', async () => {
      openai.respond.mockResolvedValue(note('This buyer from an unusual country looks suspicious.'))
      const { payment } = await make({ buyer: throwaway() })
      const row = await assessmentOf(payment.id)
      expect(row.explanation_source).toBe('rules')
      expect(row.explanation).toMatch(/^Held for review\./)
    })

    it('leaves the rules sentence, and the decision, when the AI fails', async () => {
      openai.respond.mockRejectedValue(
        Object.assign(new Error('down'), { name: 'AiError', code: 'unreachable', unreachable: true }),
      )
      const { payment } = await make({ buyer: throwaway() })
      expect(payment.status).toBe('in_review')
      const row = await assessmentOf(payment.id)
      expect(row).toMatchObject({ explanation_source: 'rules', decision: 'review' })
    })

    it('leaves the rules sentence when the AI gives nothing usable', async () => {
      openai.respond.mockResolvedValue(note('   '))
      const { payment } = await make({ buyer: throwaway() })
      expect((await assessmentOf(payment.id)).explanation_source).toBe('rules')
    })

    it("is not asked at all once the day's budget is spent", async () => {
      await db.query(
        "insert into public.ai_usage (feature, model, input_tokens, output_tokens) values ('test', 'm', $1, 0)",
        [env.ai.dailyTokenBudget],
      )
      const { payment } = await make({ buyer: throwaway() })
      expect(openai.respond).not.toHaveBeenCalled()
      expect(payment.status).toBe('in_review')
      expect((await assessmentOf(payment.id)).explanation_source).toBe('rules')
      await db.query("delete from public.ai_usage where feature = 'test'")
    })

    it('is not asked when the AI is not connected', async () => {
      const quiet = createApp({ env: loadEnv({ NODE_ENV: 'test' }), logger, db, paypal })
      address += 1
      const response = await quiet.request('/api/checkout/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `11.0.0.${address & 255}` },
        body: JSON.stringify(order({ buyer: throwaway() })),
      })
      const { payment } = (await response.json()).data
      expect(payment.status).toBe('in_review')
      expect((await assessmentOf(payment.id)).explanation_source).toBe('rules')
    })
  })

  describe('fairness', () => {
    it('gives the same behaviour the same score in every country', async () => {
      const scores = []
      for (const country of ['CI', 'SN', 'CM', 'NG']) {
        const { payment } = await make({ country, buyer: throwaway() })
        const row = await assessmentOf(payment.id)
        scores.push([row.score, row.level, row.signals.map((entry) => entry.id).join()])
      }
      expect(new Set(scores.map((entry) => entry.join('|'))).size).toBe(1)
      expect(scores[0][0]).toBe(40)
    })

    it('scores one payment the same as if it came from any country', async () => {
      const risk = createRiskService({ db, ai: { enabled: false } })
      const { payment } = await make({ buyer: throwaway() })
      const stored = await one(
        `select p.buyer_id, p.merchant_id, p.method_id, p.created_at, p.amount_usd_cents, b.email
           from public.payments p join public.buyers b on b.id = p.buyer_id where p.id = $1`,
        [payment.id],
      )
      const input = {
        buyerId: stored.buyer_id,
        merchantId: stored.merchant_id,
        methodId: stored.method_id,
        email: stored.email,
        amountUsdCents: stored.amount_usd_cents,
        at: new Date(stored.created_at).toISOString(),
      }
      const results = []
      for (const countryCode of ['CI', 'KE', 'NG', 'GH', 'SN', 'CM', 'ZA']) {
        const scored = await risk.scoreFor({ ...input, countryCode, country: countryCode, nationality: 'x', name: 'y' })
        results.push(`${scored.score}:${scored.level}`)
      }
      expect(new Set(results).size).toBe(1)
    })

    it('has a signals query that never mentions a country, a name, a language or a phone', () => {
      const source = readFileSync(new URL('./repositories/risk.repository.js', import.meta.url), 'utf8')
      const query = source.slice(source.indexOf('async signals('), source.indexOf('async insertAssessment('))
      expect(query.length).toBeGreaterThan(500)
      expect(query).not.toMatch(/country|nation|ethnic|name|language|phone|currency|region/i)
    })

    it('has the database supply exactly the inputs the rules name, and nothing else', async () => {
      const [signals] = await createRiskRepository({ db }).signals([
        { buyerId: randomUUID(), merchantId: randomUUID(), methodId: 'card', at: null },
      ])
      const fromEmailAndPrice = ['throwawayEmail', 'amountUsdCents']
      expect(Object.keys(signals).sort()).toEqual(
        RISK_INPUTS.map((input) => input.id)
          .filter((id) => !fromEmailAndPrice.includes(id))
          .sort(),
      )
      expect(() => scoreRisk({ ...signals, throwawayEmail: false, amountUsdCents: 1000 })).not.toThrow()
    })
  })

  describe('the first request', () => {
    it('does not break on a payment with no history at all', async () => {
      const { payment } = await make({ country: 'ZA', method: 'bank_transfer' })
      expect(payment.status).toBe('processing')
    })
  })
})

describe('scoring the history', () => {
  let db
  let risk

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    risk = createRiskService({ db, ai: { enabled: false } })
  })
  afterAll(() => db.close())

  it('scores every payment once, and does nothing the second time', async () => {
    const payments = (await db.query('select count(*)::int as n from public.payments'))[0].n
    expect(payments).toBeGreaterThan(1000)
    expect(await risk.scoreHistory({ batch: 700 })).toBe(payments)
    expect((await db.query('select count(*)::int as n from public.risk_assessments'))[0].n).toBe(payments)
    expect(await risk.scoreHistory()).toBe(0)
  })

  it('finds the demo history overwhelmingly low risk, and never applies a decision to settled payments', async () => {
    const rows = await db.query(
      'select level, decision, enforced, count(*)::int as n from public.risk_assessments group by 1, 2, 3',
    )
    const total = rows.reduce((sum, row) => sum + row.n, 0)
    const low = rows.filter((row) => row.level === 'low').reduce((sum, row) => sum + row.n, 0)
    expect(low / total).toBeGreaterThan(0.97)
    for (const row of rows) {
      if (row.decision === 'allow') expect(row.enforced).toBe(true)
      else expect(row.enforced).toBe(false)
    }
  })

  it('scores a payment the same in a batch as on its own', async () => {
    const sample = await db.query(
      `select p.id, p.buyer_id, p.merchant_id, p.method_id, p.created_at, p.amount_usd_cents, b.email, r.score, r.level
         from public.payments p join public.buyers b on b.id = p.buyer_id
         join public.risk_assessments r on r.payment_id = p.id
        order by p.created_at desc limit 60`,
    )
    for (const row of sample) {
      const alone = await risk.scoreFor({
        buyerId: row.buyer_id,
        merchantId: row.merchant_id,
        methodId: row.method_id,
        email: row.email,
        amountUsdCents: row.amount_usd_cents,
        at: new Date(row.created_at).toISOString(),
      })
      expect([alone.score, alone.level]).toEqual([row.score, row.level])
    }
  })

  it('keeps each assessment dated like its payment', async () => {
    const off = await db.query(
      `select count(*)::int as n from public.risk_assessments r join public.payments p on p.id = r.payment_id
        where r.created_at <> p.created_at`,
    )
    expect(off[0].n).toBe(0)
  })
})
