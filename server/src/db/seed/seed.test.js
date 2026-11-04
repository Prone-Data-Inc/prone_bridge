import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../migrate.js'
import { createTestDb } from '../testing.js'
import { applySeed, clearData, hasData } from './apply.js'
import { abandonRate, buildSeed } from './build.js'
import { COUNTRIES, COUNTRY_METHODS, MERCHANTS } from './data.js'

const NOW = new Date('2026-11-04T12:00:00.000Z')
const data = buildSeed({ now: NOW })
const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row), 0)

describe('buildSeed', () => {
  it('is reproducible: the same inputs give the same data', () => {
    expect(JSON.stringify(buildSeed({ now: NOW }))).toBe(JSON.stringify(data))
  })

  it('changes with the seed', () => {
    expect(JSON.stringify(buildSeed({ now: NOW, seed: 'another' }))).not.toBe(JSON.stringify(data))
  })

  it('has the merchants, countries and methods of the demo', () => {
    expect(data.merchants.map((m) => m.slug)).toEqual(MERCHANTS.map((m) => m.slug))
    expect(data.countries).toHaveLength(COUNTRIES.length)
    expect(data.country_methods).toHaveLength(Object.values(COUNTRY_METHODS).flat().length)
    expect(data.merchant_methods).toHaveLength(data.country_methods.length * MERCHANTS.length)
  })

  it('offers PayPal and card in every country', () => {
    for (const country of COUNTRIES) {
      const methods = data.country_methods
        .filter((row) => row.country_code === country.code)
        .map((row) => row.method_id)
      expect(methods).toContain('paypal')
      expect(methods).toContain('card')
    }
  })

  it('names no bank, wallet or payment company', () => {
    const text = JSON.stringify([data.payment_methods, data.merchants, data.products]).toLowerCase()
    for (const name of [
      'mpesa',
      'm-pesa',
      'orange',
      'wave',
      'mtn',
      'moov',
      'paystack',
      'flutterwave',
      'stripe',
      'visa checkout',
    ]) {
      expect(text).not.toContain(name)
    }
  })

  it('has a plausible amount of history', () => {
    const pdl = data.merchants.find((m) => m.slug === 'pdl')
    const pdlPayments = data.payments.filter((p) => p.merchant_id === pdl.id)
    expect(pdlPayments.length).toBeGreaterThan(400)
    expect(data.payments.length).toBeGreaterThan(900)
    expect(data.checkout_sessions.length).toBeGreaterThan(data.payments.length)
  })

  it('keeps every payment consistent with its price, rate and fee', () => {
    const countryByCode = Object.fromEntries(data.countries.map((c) => [c.code, c]))
    const productById = Object.fromEntries(data.products.map((p) => [p.id, p]))
    const methodById = Object.fromEntries(data.payment_methods.map((m) => [m.id, m]))

    for (const payment of data.payments) {
      const product = productById[payment.product_id]
      const country = countryByCode[payment.country_code]
      const method = methodById[payment.method_id]
      expect(product.merchant_id).toBe(payment.merchant_id)
      expect(payment.amount_usd_cents).toBe(product.price_usd_cents)
      expect(payment.display_currency).toBe(country.currency)
      expect(payment.fx_rate).toBe(country.fx_per_usd)
      const exact = (payment.amount_usd_cents / 100) * country.fx_per_usd * 10 ** country.minor_units
      expect(Math.abs(payment.display_amount_minor - exact)).toBeLessThanOrEqual(country.price_step / 2)
      expect(payment.fee_usd_cents).toBe(
        Math.round((payment.amount_usd_cents * method.fee_bps) / 10_000) + method.fee_fixed_cents,
      )
      expect(payment.fee_usd_cents).toBeLessThan(payment.amount_usd_cents)
      expect(payment.provider).toBe('simulated')
      expect(payment.origin).toBe('seed')
    }
  })

  it('only uses methods the country offers and the merchant switched on', () => {
    const on = new Set(
      data.merchant_methods.filter((m) => m.enabled).map((m) => `${m.merchant_id}:${m.country_code}:${m.method_id}`),
    )
    for (const payment of data.payments) {
      expect(on.has(`${payment.merchant_id}:${payment.country_code}:${payment.method_id}`)).toBe(true)
    }
  })

  it('never lies in the future and keeps completion after creation', () => {
    for (const payment of data.payments) {
      expect(Date.parse(payment.created_at)).toBeLessThan(NOW.getTime())
      expect(Date.parse(payment.completed_at)).toBeGreaterThanOrEqual(Date.parse(payment.created_at))
      expect(Date.parse(payment.completed_at)).toBeLessThanOrEqual(NOW.getTime())
    }
  })

  it('has mostly successful payments, some failures and a few refunds', () => {
    const count = (status) => data.payments.filter((p) => p.status === status).length
    const total = data.payments.length
    expect(count('succeeded') / total).toBeGreaterThan(0.85)
    expect(count('failed')).toBeGreaterThan(10)
    expect(count('refunded')).toBeGreaterThan(3)
    expect(count('failed') / total).toBeLessThan(0.15)
  })

  it('pays out exactly what the linked payments earned', () => {
    expect(data.payouts.length).toBeGreaterThan(20)
    for (const payout of data.payouts) {
      const linked = data.payments.filter((p) => p.payout_id === payout.id)
      expect(linked).toHaveLength(payout.payments_count)
      expect(payout.amount_usd_cents).toBe(sum(linked, (p) => p.amount_usd_cents - p.fee_usd_cents))
      expect(linked.every((p) => p.status === 'succeeded' && p.merchant_id === payout.merchant_id)).toBe(true)
      expect(Date.parse(payout.paid_at)).toBeLessThan(NOW.getTime())
    }
  })

  it('leaves the latest days unpaid', () => {
    const recent = data.payments.filter(
      (p) => p.status === 'succeeded' && Date.parse(p.completed_at) > NOW.getTime() - 2 * 86_400_000,
    )
    expect(recent.length).toBeGreaterThan(0)
    expect(recent.every((p) => p.payout_id === null)).toBe(true)
  })

  it('enrolls every successful payment once, and nobody twice in a course', () => {
    const succeeded = data.payments.filter((p) => p.status === 'succeeded')
    expect(data.enrollments).toHaveLength(succeeded.length)
    expect(new Set(data.enrollments.map((e) => e.payment_id)).size).toBe(data.enrollments.length)
    expect(new Set(data.enrollments.map((e) => `${e.buyer_id}:${e.product_id}`)).size).toBe(data.enrollments.length)
  })

  it('uses unique references and emails', () => {
    const refs = [...data.payments.map((p) => p.reference), ...data.payouts.map((p) => p.reference)]
    expect(new Set(refs).size).toBe(refs.length)
    expect(new Set(data.buyers.map((b) => b.email.toLowerCase())).size).toBe(data.buyers.length)
    expect(data.buyers.every((b) => b.email.endsWith('@example.com'))).toBe(true)
  })

  it('loses more buyers where the merchant is missing the method people expect', () => {
    const pdl = data.merchants.find((m) => m.slug === 'pdl')
    const rate = (code) => {
      const sessions = data.checkout_sessions.filter((s) => s.merchant_id === pdl.id && s.country_code === code)
      return sessions.filter((s) => s.outcome === 'abandoned').length / sessions.length
    }
    expect(rate('KE')).toBeGreaterThan(rate('CI') + 0.15)
    expect(abandonRate('KE', new Set(['card', 'paypal', 'bank_transfer']))).toBeGreaterThan(
      abandonRate('KE', new Set(['mobile_money', 'card', 'paypal'])),
    )
  })

  it('has some unread notifications for the seller and the admin', () => {
    const unread = data.notifications.filter((n) => !n.read_at)
    expect(unread.some((n) => n.audience === 'seller')).toBe(true)
    expect(unread.some((n) => n.audience === 'admin')).toBe(true)
    expect(
      data.notifications.every(
        (n) => (n.audience !== 'seller' || n.merchant_id) && (n.audience !== 'buyer' || n.buyer_id),
      ),
    ).toBe(true)
  })
})

describe('applySeed', () => {
  let db
  let counts

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    counts = await applySeed(db, data)
  })
  afterAll(() => db.close())

  it('writes every table and reports the counts', async () => {
    expect(counts.payments).toBe(data.payments.length)
    const [row] = await db.query('select count(*)::int as n from public.payments')
    expect(row.n).toBe(data.payments.length)
    const [events] = await db.query('select count(*)::int as n from public.payment_events')
    expect(events.n).toBe(data.payment_events.length)
  })

  it('computes the net amount in the database', async () => {
    const [row] = await db.query(
      'select count(*)::int as bad from public.payments where net_usd_cents <> amount_usd_cents - fee_usd_cents',
    )
    expect(row.bad).toBe(0)
  })

  it('does not fire a live signal for every seeded row', async () => {
    const sent = await db.query('select count(*)::int as n from realtime.sent')
    expect(sent[0].n).toBe(0)
  })

  it('turns the live signals back on afterwards', async () => {
    const [{ id }] = await db.query('select id from public.merchants limit 1')
    await db.query(
      "insert into public.notifications (audience, merchant_id, kind, title, body) values ('seller', $1, 'test', 'Hi', 'There')",
      [id],
    )
    expect((await db.query('select count(*)::int as n from realtime.sent'))[0].n).toBe(1)
  })

  it('knows when it has data, and clears everything but the history of migrations', async () => {
    expect(await hasData(db)).toBe(true)
    await clearData(db)
    expect(await hasData(db)).toBe(false)
    expect((await db.query('select count(*)::int as n from public.schema_migrations'))[0].n).toBeGreaterThan(0)
    await applySeed(db, data)
    expect(await hasData(db)).toBe(true)
  })
})
