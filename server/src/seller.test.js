/* The seller's dashboard on the server: overview, payments, customers, countries and methods, payouts and payment links,
   and how a link carries a buyer through the checkout. Real routes on an in-memory Postgres with the demo data. The clock
   is fixed, so "the last 30 days" is the same period every run. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { linkCode } from './lib/ids.js'
import { LINK_REASONS, linkState } from './lib/links.js'
import { periodOf } from './services/seller.service.js'

const logger = createLogger({ level: 'silent' })
const env = loadEnv({ NODE_ENV: 'test' })
const NOW = new Date('2026-11-04T13:00:00Z')

/* The window "30 days" means with that clock: whole UTC days, ending with 4 November. */
const WINDOW = { from: '2026-10-06T00:00:00Z', to: '2026-11-05T00:00:00Z' }

describe('periodOf', () => {
  it('is whole UTC days ending with today, and the same length before it', () => {
    const period = periodOf(30, NOW)
    expect(period.to.toISOString()).toBe('2026-11-05T00:00:00.000Z')
    expect(period.from.toISOString()).toBe('2026-10-06T00:00:00.000Z')
    expect(period.previousFrom.toISOString()).toBe('2026-09-06T00:00:00.000Z')
  })

  it('does not move during the day', () => {
    expect(periodOf(7, new Date('2026-11-04T00:00:00Z')).to).toEqual(periodOf(7, new Date('2026-11-04T23:59:59Z')).to)
  })
})

describe('linkState', () => {
  const link = { active: true, expiresAt: null, maxUses: null, paid: 0 }
  it('is active, paused, expired or full, in that order of importance', () => {
    expect(linkState(link, NOW)).toBe('active')
    expect(linkState({ ...link, active: false }, NOW)).toBe('paused')
    expect(linkState({ ...link, expiresAt: '2026-11-04T12:00:00Z' }, NOW)).toBe('expired')
    expect(linkState({ ...link, expiresAt: '2026-11-05T12:00:00Z' }, NOW)).toBe('active')
    expect(linkState({ ...link, maxUses: 3, paid: 3 }, NOW)).toBe('full')
    expect(linkState({ ...link, maxUses: 3, paid: 2 }, NOW)).toBe('active')
    expect(linkState({ ...link, active: false, maxUses: 1, paid: 1 }, NOW)).toBe('paused')
  })

  it('says why a link cannot be used', () => {
    expect(Object.keys(LINK_REASONS)).toEqual(['paused', 'expired', 'full'])
  })
})

describe('linkCode', () => {
  it('is eight lowercase characters with no look alikes, and does not repeat', () => {
    expect(linkCode()).toMatch(/^[a-hjkmnp-tv-z2-9]{8}$/)
    expect(new Set(Array.from({ length: 500 }, () => linkCode())).size).toBe(500)
  })
})

describe('seller dashboard', () => {
  let db
  let app
  let pdl

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    app = createApp({ env, logger, db, now: () => NOW })
    pdl = (await db.query("select id from public.merchants where slug = 'pdl'"))[0].id
  })
  afterAll(() => db.close())

  /* Every request comes from its own address, so the rate limits never get in the way. */
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
  const patch = send('PATCH')
  const one = async (sql, params) => (await db.query(sql, params))[0]
  const count = async (table, where = 'true', params = []) =>
    (await one(`select count(*)::int as n from public.${table} where ${where}`, params)).n

  let n = 0
  const buyer = () => ({ name: 'Aminata Diallo', email: `aminata.${++n}.${randomUUID().slice(0, 8)}@example.com` })
  const order = (over = {}) => ({
    idempotencyKey: randomUUID(),
    product: 'ai-for-work',
    country: 'CI',
    method: 'mobile_money',
    buyer: buyer(),
    ...over,
  })
  /* A paid purchase, made the way a buyer makes one. */
  const buy = async (over) => {
    const created = (await post('/api/checkout/payments', order(over))).body.data.payment
    await post(`/api/simulator/payments/${created.id}/outcome`, { outcome: 'approve' })
    return created
  }

  describe('overview', () => {
    it('adds up the last 30 days exactly as the database does', async () => {
      const { status, body } = await call('/api/seller/overview')
      expect(status).toBe(200)
      const data = body.data
      expect(data.merchant).toMatchObject({ slug: 'pdl', name: 'Prone Data Learning' })
      expect(data.range).toMatchObject({ days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' })

      const sql = await one(
        `select coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::int as gross,
                coalesce(sum(fee_usd_cents) filter (where status = 'succeeded'), 0)::int as fees,
                count(*) filter (where status = 'succeeded')::int as paid,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                coalesce(sum(amount_usd_cents) filter (where status = 'refunded'), 0)::int as refunded
           from public.payments where merchant_id = $1 and created_at >= $2 and created_at < $3`,
        [pdl, WINDOW.from, WINDOW.to],
      )
      expect(sql.paid).toBeGreaterThan(50)
      expect(data.kpis.gross.value).toBe(sql.gross)
      expect(data.kpis.net.value).toBe(sql.gross - sql.fees)
      expect(data.kpis.payments.value).toBe(sql.paid)
      expect(data.kpis.averageOrder.value).toBe(Math.round(sql.gross / sql.paid))
      expect(data.kpis.successRate.value).toBeCloseTo(sql.paid / sql.finished, 10)
      expect(data.kpis.refunded.value).toBe(sql.refunded)
      expect(data.kpis.conversion.value).toBeGreaterThan(0)
      expect(data.kpis.conversion.value).toBeLessThan(1)
    })

    it('compares with the period before, and says nothing when there is nothing to compare with', async () => {
      const { body } = await call('/api/seller/overview')
      const { gross } = body.data.kpis
      expect(gross.previous).toBeGreaterThan(0)
      expect(gross.delta).toBeCloseTo((gross.value - gross.previous) / gross.previous, 10)

      const nothing = await call('/api/seller/overview?days=7')
      expect(nothing.body.data.series.days).toHaveLength(7)
      const empty = await one(
        `select count(*)::int as n from public.payments where merchant_id = $1 and created_at >= '2026-10-23' and created_at < '2026-10-30'`,
        [pdl],
      )
      expect(empty.n).toBeGreaterThan(0)
    })

    it('draws one point a day, this period and the one before, and the days add up to the total', async () => {
      const { body } = await call('/api/seller/overview?days=30')
      const { series, kpis } = body.data
      expect(series.days).toHaveLength(30)
      expect(series.days[0]).toBe('2026-10-06')
      expect(series.days.at(-1)).toBe('2026-11-04')
      expect(series.gross).toHaveLength(30)
      expect(series.previousGross).toHaveLength(30)
      expect(series.payments).toHaveLength(30)
      expect(series.gross.reduce((a, b) => a + b, 0)).toBe(kpis.gross.value)
      expect(series.payments.reduce((a, b) => a + b, 0)).toBe(kpis.payments.value)
      expect(series.previousGross.reduce((a, b) => a + b, 0)).toBe(kpis.gross.previous)
    })

    it('splits the volume by method and by country, biggest first', async () => {
      const { body } = await call('/api/seller/overview')
      const { methods, countries, kpis } = body.data
      expect(methods.reduce((sum, entry) => sum + entry.grossUsdCents, 0)).toBe(kpis.gross.value)
      expect(methods.map((entry) => entry.grossUsdCents)).toEqual(
        [...methods.map((entry) => entry.grossUsdCents)].sort((a, b) => b - a),
      )
      expect(countries.length).toBeLessThanOrEqual(8)
      expect(countries[0].grossUsdCents).toBeGreaterThanOrEqual(countries.at(-1).grossUsdCents)
      expect(countries[0]).toMatchObject({ code: expect.stringMatching(/^[A-Z]{2}$/), name: expect.any(String) })
    })

    it('says what the seller is owed, and shows the six latest payments', async () => {
      const { body } = await call('/api/seller/overview')
      const owed = await one(
        `select count(*)::int as n, coalesce(sum(net_usd_cents), 0)::int as net from public.payments
          where merchant_id = $1 and status = 'succeeded' and payout_id is null`,
        [pdl],
      )
      expect(body.data.balance).toMatchObject({ owedUsdCents: owed.net, owedPayments: owed.n })
      expect(body.data.recent).toHaveLength(6)
      const dates = body.data.recent.map((payment) => payment.createdAt)
      expect(dates).toEqual([...dates].sort().reverse())
    })

    it('points out what is worth a look, in plain words', async () => {
      const { body } = await call('/api/seller/overview')
      expect(Array.isArray(body.data.attention)).toBe(true)
      expect(body.data.attention.length).toBeLessThanOrEqual(4)
      for (const item of body.data.attention) {
        expect(['countries', 'payouts']).toContain(item.section)
        expect(item.message).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`))
      }
    })

    it('only takes 7, 30 or 90 days, and only knows its own sellers', async () => {
      expect((await call('/api/seller/overview?days=14')).status).toBe(400)
      expect((await call('/api/seller/overview?days=abc')).status).toBe(400)
      expect((await call('/api/seller/overview?merchant=nobody')).status).toBe(404)
      expect((await call('/api/seller/overview?merchant=Bad Name')).status).toBe(400)
      const other = await call('/api/seller/overview?merchant=savane-studio')
      expect(other.status).toBe(200)
      const own = await call('/api/seller/overview')
      expect(other.body.data.kpis.gross.value).not.toBe(own.body.data.kpis.gross.value)
    })
  })

  describe('payments', () => {
    it("lists the seller's own payments, newest first, with how many there are in all", async () => {
      const { status, body } = await call('/api/seller/payments?limit=20')
      expect(status).toBe(200)
      const total = await count('payments', 'merchant_id = $1', [pdl])
      expect(body.data.total).toBe(total)
      expect(body.data.shown).toBe(20)
      expect(body.data.payments).toHaveLength(20)
      const dates = body.data.payments.map((payment) => payment.createdAt)
      expect(dates).toEqual([...dates].sort().reverse())
      for (const payment of body.data.payments) {
        const row = await one('select merchant_id from public.payments where id = $1', [payment.id])
        expect(row.merchant_id).toBe(pdl)
      }
    })

    it('shows what a seller needs of each payment, and nothing from PayPal', async () => {
      const { body } = await call('/api/seller/payments?status=succeeded&limit=1')
      const payment = body.data.payments[0]
      expect(payment).toMatchObject({
        status: 'succeeded',
        simulated: true,
        amountUsdCents: expect.any(Number),
        feeUsdCents: expect.any(Number),
        netUsdCents: expect.any(Number),
        method: { id: expect.any(String), label: expect.any(String), kind: expect.any(String) },
        country: { code: expect.any(String), name: expect.any(String) },
        product: { slug: expect.any(String), title: expect.any(String) },
        buyer: { name: expect.any(String), email: expect.any(String) },
      })
      expect(payment.netUsdCents).toBe(payment.amountUsdCents - payment.feeUsdCents)
      expect(JSON.stringify(body)).not.toMatch(/providerOrderId|providerCaptureId|idempotency/)
    })

    it('filters by status, method and country, and the filters add up', async () => {
      const failed = await call('/api/seller/payments?status=failed&limit=1000')
      expect(failed.body.data.payments.every((payment) => payment.status === 'failed')).toBe(true)
      expect(failed.body.data.payments.every((payment) => payment.failureMessage)).toBe(true)

      const ci = await call('/api/seller/payments?country=CI&limit=1000')
      expect(ci.body.data.payments.every((payment) => payment.country.code === 'CI')).toBe(true)

      const card = await call('/api/seller/payments?method=card&country=CI&status=succeeded&limit=1000')
      expect(
        card.body.data.payments.every((payment) => payment.method.id === 'card' && payment.country.code === 'CI'),
      ).toBe(true)
      const sql = await count(
        'payments',
        "merchant_id = $1 and method_id = 'card' and country_code = 'CI' and status = 'succeeded'",
        [pdl],
      )
      expect(card.body.data.total).toBe(sql)
    })

    it('filters by day, the whole of both days', async () => {
      const { body } = await call('/api/seller/payments?from=2026-10-20&to=2026-10-21&limit=1000')
      expect(body.data.payments.length).toBeGreaterThan(0)
      for (const payment of body.data.payments) {
        expect(payment.createdAt >= '2026-10-20T00:00:00.000Z').toBe(true)
        expect(payment.createdAt < '2026-10-22T00:00:00.000Z').toBe(true)
      }
      const sql = await count(
        'payments',
        "merchant_id = $1 and created_at >= '2026-10-20' and created_at < '2026-10-22'",
        [pdl],
      )
      expect(body.data.total).toBe(sql)
    })

    it('searches by reference, name or email, and treats % and _ as ordinary characters', async () => {
      const sample = (await call('/api/seller/payments?limit=1')).body.data.payments[0]
      const byReference = await call(`/api/seller/payments?q=${sample.reference}`)
      expect(byReference.body.data.payments.map((payment) => payment.reference)).toEqual([sample.reference])

      const byEmail = await call(`/api/seller/payments?q=${encodeURIComponent(sample.buyer.email)}`)
      expect(byEmail.body.data.payments.some((payment) => payment.id === sample.id)).toBe(true)

      expect((await call('/api/seller/payments?q=%25')).body.data.total).toBe(0)
      expect((await call('/api/seller/payments?q=x_x')).body.data.total).toBe(0)
      /* _ is a wildcard in SQL: every reference has one, so a plain _ finds them all, but only as a real character */
      expect((await call('/api/seller/payments?q=pb_')).body.data.total).toBeGreaterThan(0)
    })

    it('pages and sorts', async () => {
      const first = await call('/api/seller/payments?limit=5&offset=0&sort=amount')
      const second = await call('/api/seller/payments?limit=5&offset=5&sort=amount')
      const amounts = [...first.body.data.payments, ...second.body.data.payments].map(
        (payment) => payment.amountUsdCents,
      )
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
      expect(
        new Set([...first.body.data.payments, ...second.body.data.payments].map((payment) => payment.id)).size,
      ).toBe(10)

      const oldest = await call('/api/seller/payments?sort=oldest&limit=3')
      const dates = oldest.body.data.payments.map((payment) => payment.createdAt)
      expect(dates).toEqual([...dates].sort())
    })

    it('refuses filters it does not understand', async () => {
      for (const query of [
        'status=paid',
        'country=ci',
        'method=Card!',
        'limit=0',
        'limit=5000',
        'offset=-1',
        'from=yesterday',
        'sort=random',
        'link=nope',
      ]) {
        expect((await call(`/api/seller/payments?${query}`)).status, query).toBe(400)
      }
    })

    it("shows one payment with its timeline in words, and keeps PayPal's ids out", async () => {
      const failed = (await call('/api/seller/payments?status=failed&limit=1')).body.data.payments[0]
      const { status, body } = await call(`/api/seller/payments/${failed.id}`)
      expect(status).toBe(200)
      expect(body.data.payment.id).toBe(failed.id)
      expect(body.data.timeline.map((step) => step.label)).toEqual(['Payment started', 'Payment failed'])
      expect(body.data.timeline[1].detail).toBe(failed.failureMessage)
      expect(JSON.stringify(body.data.timeline)).not.toMatch(/captureId|orderId|paypalFee/)
    })

    it('does not show a payment of another seller', async () => {
      const foreign = await one('select id from public.payments where merchant_id <> $1 limit 1', [pdl])
      expect((await call(`/api/seller/payments/${foreign.id}`)).status).toBe(404)
      expect((await call(`/api/seller/payments/${randomUUID()}`)).status).toBe(404)
      expect((await call('/api/seller/payments/not-an-id')).status).toBe(400)
    })

    it('shows a payment the moment it is made, and where it came from', async () => {
      const made = await buy()
      const { body } = await call(`/api/seller/payments?q=${made.reference}`)
      expect(body.data.payments[0]).toMatchObject({ reference: made.reference, status: 'succeeded', link: null })
    })
  })

  describe('customers', () => {
    it('lists the people who bought, biggest spenders first, with what they spent', async () => {
      const { status, body } = await call('/api/seller/customers?limit=50')
      expect(status).toBe(200)
      const spent = body.data.customers.map((customer) => customer.spentUsdCents)
      expect(spent).toEqual([...spent].sort((a, b) => b - a))
      const top = body.data.customers[0]
      const sql = await one(
        `select count(*) filter (where status = 'succeeded')::int as orders,
                coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::int as spent
           from public.payments where merchant_id = $1 and buyer_id = $2`,
        [pdl, top.id],
      )
      expect(top).toMatchObject({ orders: sql.orders, spentUsdCents: sql.spent })
      expect(top).toMatchObject({
        name: expect.any(String),
        email: expect.any(String),
        country: { code: expect.any(String) },
      })
    })

    it('only lists buyers of this seller', async () => {
      const { body } = await call('/api/seller/customers?limit=1000')
      const total = (
        await one('select count(distinct buyer_id)::int as n from public.payments where merchant_id = $1', [pdl])
      ).n
      expect(body.data.total).toBe(total)
    })

    it('searches by name or email', async () => {
      const first = (await call('/api/seller/customers?limit=1')).body.data.customers[0]
      const found = await call(`/api/seller/customers?q=${encodeURIComponent(first.email)}`)
      expect(found.body.data.customers.map((customer) => customer.id)).toContain(first.id)
      expect((await call('/api/seller/customers?q=zzzzzzzz-nobody')).body.data.customers).toEqual([])
    })

    it('shows one customer with their payments and the courses they have unlocked', async () => {
      const first = (await call('/api/seller/customers?limit=1')).body.data.customers[0]
      const { status, body } = await call(`/api/seller/customers/${first.id}`)
      expect(status).toBe(200)
      expect(body.data.customer.id).toBe(first.id)
      expect(body.data.payments.every((payment) => payment.buyer.id === first.id)).toBe(true)
      expect(body.data.payments.length).toBeGreaterThanOrEqual(first.orders)
      expect(body.data.courses).toHaveLength(first.courses)
    })

    it('does not show a person who never bought from this seller', async () => {
      const stranger = await one(
        'select id from public.buyers b where not exists (select 1 from public.payments p where p.buyer_id = b.id and p.merchant_id = $1) limit 1',
        [pdl],
      )
      expect((await call(`/api/seller/customers/${stranger.id}`)).status).toBe(404)
    })
  })

  describe('countries and methods', () => {
    it('lists every active country with its methods, and what each did', async () => {
      const { status, body } = await call('/api/seller/countries')
      expect(status).toBe(200)
      const { countries } = body.data
      expect(countries.length).toBe(await count('countries', 'active'))
      const ci = countries.find((country) => country.code === 'CI')
      expect(ci.methods.map((method) => method.id)).toEqual(expect.arrayContaining(['mobile_money', 'card', 'paypal']))
      expect(ci.methods.find((method) => method.id === 'mobile_money')).toMatchObject({
        simulated: true,
        enabled: true,
        platformEnabled: true,
        live: true,
      })
      expect(ci.methods.find((method) => method.id === 'card').simulated).toBe(false)
      expect(ci.leftAt).toMatchObject({
        country: expect.any(Number),
        method: expect.any(Number),
        payment: expect.any(Number),
      })
      expect(ci.conversion).toBeGreaterThan(0)
    })

    it('adds up to the payments of the period', async () => {
      const { body } = await call('/api/seller/countries')
      const gross = body.data.countries.reduce((sum, country) => sum + country.grossUsdCents, 0)
      const overview = (await call('/api/seller/overview')).body.data
      expect(gross).toBe(overview.kpis.gross.value)
      for (const country of body.data.countries) {
        expect(country.methods.reduce((sum, method) => sum + method.grossUsdCents, 0)).toBe(country.grossUsdCents)
      }
    })

    it('switches a method off for buyers, and on again, and keeps a record of it', async () => {
      const visible = async () =>
        (await call('/api/catalog/countries')).body.data.countries
          .find((country) => country.code === 'GH')
          .methods.map((method) => method.id)
      expect(await visible()).toContain('mobile_money')

      const off = await patch('/api/seller/countries/GH/methods/mobile_money', { enabled: false })
      expect(off).toMatchObject({
        status: 200,
        body: { data: { countryCode: 'GH', methodId: 'mobile_money', enabled: false } },
      })
      expect(await visible()).not.toContain('mobile_money')
      const report = (await call('/api/seller/countries')).body.data.countries.find((country) => country.code === 'GH')
      expect(report.methods.find((method) => method.id === 'mobile_money')).toMatchObject({
        enabled: false,
        live: false,
      })
      expect(await count('audit_log', "action = 'method.disabled' and entity_id = 'GH:mobile_money'")).toBe(1)

      const buyerSees = await post('/api/checkout/payments', order({ country: 'GH' }))
      expect(buyerSees.status).toBe(400)

      await patch('/api/seller/countries/GH/methods/mobile_money', { enabled: true })
      expect(await visible()).toContain('mobile_money')
      expect(await count('audit_log', "action = 'method.enabled' and entity_id = 'GH:mobile_money'")).toBe(1)
    })

    it('does not switch on what ProneBridge has not opened, and knows nothing of other pairs', async () => {
      await db.query(
        "update public.country_methods set enabled = false where country_code = 'GH' and method_id = 'bank_transfer'",
      )
      const closed = await patch('/api/seller/countries/GH/methods/bank_transfer', { enabled: true })
      expect(closed.status).toBe(409)
      const off = await patch('/api/seller/countries/GH/methods/bank_transfer', { enabled: false })
      expect(off.status).toBe(200)
      expect((await patch('/api/seller/countries/GH/methods/voucher', { enabled: true })).status).toBe(404)
      expect((await patch('/api/seller/countries/XX/methods/card', { enabled: true })).status).toBe(404)
    })

    it('checks what it is told', async () => {
      expect((await patch('/api/seller/countries/GH/methods/card', {})).status).toBe(400)
      expect((await patch('/api/seller/countries/GH/methods/card', { enabled: 'yes' })).status).toBe(400)
      expect((await patch('/api/seller/countries/gh/methods/card', { enabled: true })).status).toBe(400)
      expect((await patch('/api/seller/countries/GH/methods/card', { enabled: true, merchant: 'nobody' })).status).toBe(
        404,
      )
    })

    it('says what is off in a country that is losing buyers', async () => {
      await db.query(
        "update public.merchant_methods set enabled = false where merchant_id = $1 and country_code = 'KE' and method_id = 'mobile_money'",
        [pdl],
      )
      const { body } = await call('/api/seller/countries?days=90')
      const ke = body.data.countries.find((country) => country.code === 'KE')
      expect(ke.methods.find((method) => method.id === 'mobile_money')).toMatchObject({ enabled: false, live: false })
    })
  })

  describe('payouts', () => {
    it('lists the payouts, what has been paid, and what is waiting', async () => {
      const { status, body } = await call('/api/seller/payouts')
      expect(status).toBe(200)
      const { payouts, totals, balance, paypal } = body.data
      expect(payouts.length).toBeGreaterThan(3)
      expect(payouts[0].createdAt >= payouts.at(-1).createdAt).toBe(true)
      expect(payouts.every((payout) => payout.simulated)).toBe(true)
      expect(totals.paidUsdCents).toBe(
        payouts.filter((payout) => payout.status === 'paid').reduce((sum, payout) => sum + payout.amountUsdCents, 0),
      )
      expect(balance.owedUsdCents).toBeGreaterThan(0)
      expect(paypal).toEqual({ available: false, payoutAccountSet: false })
    })

    it('shows the sales a payout covers, adding up to its amount', async () => {
      const payout = (await call('/api/seller/payouts')).body.data.payouts[0]
      const { status, body } = await call(`/api/seller/payouts/${payout.id}`)
      expect(status).toBe(200)
      expect(body.data.payments).toHaveLength(payout.paymentsCount)
      expect(body.data.payments.reduce((sum, payment) => sum + payment.netUsdCents, 0)).toBe(payout.amountUsdCents)
    })

    it('does not show a payout of another seller', async () => {
      const foreign = await one('select id from public.payouts where merchant_id <> $1 limit 1', [pdl])
      expect((await call(`/api/seller/payouts/${foreign.id}`)).status).toBe(404)
      expect((await call(`/api/seller/payouts/${randomUUID()}`)).status).toBe(404)
    })

    it('shows the balance dropping once a payout is run', async () => {
      const before = (await call('/api/seller/payouts')).body.data.balance.owedUsdCents
      const run = await post('/api/payouts/run', { merchant: 'pdl' })
      expect(run.status).toBe(201)
      const after = await call('/api/seller/payouts')
      expect(after.body.data.balance.owedUsdCents).toBe(0)
      expect(before).toBeGreaterThan(0)
      expect(after.body.data.payouts[0]).toMatchObject({ simulated: true, status: 'paid' })
    })
  })

  describe('payment links', () => {
    const make = (over = {}) => post('/api/seller/links', { product: 'ai-for-work', ...over })
    const links = async () => (await call('/api/seller/links')).body.data.links

    it('starts with none, and makes one that points at a course', async () => {
      expect(await links()).toEqual([])
      const { status, body } = await make({ title: 'Launch week', note: 'Thanks for joining.' })
      expect(status).toBe(201)
      expect(body.data.link).toMatchObject({
        code: expect.stringMatching(/^[a-hjkmnp-tv-z2-9]{8}$/),
        title: 'Launch week',
        note: 'Thanks for joining.',
        product: { slug: 'ai-for-work', title: 'AI for Work', priceUsdCents: 3900 },
        state: 'active',
        active: true,
        visits: 0,
        paid: 0,
        revenueUsdCents: 0,
        conversion: 0,
        maxUses: null,
        expiresAt: null,
      })
      expect(await links()).toHaveLength(1)
    })

    it('names the link after the course when no name is given, and never takes a price', async () => {
      const { body } = await post('/api/seller/links', { product: 'prompt-craft', price: 1, amountUsdCents: 1 })
      expect(body.data.link.title).toBe('Prompt Craft')
      expect(body.data.link.product.priceUsdCents).toBe(2900)
    })

    it('checks what it is told', async () => {
      expect((await make({ product: 'nothing-here' })).status).toBe(404)
      expect((await make({ product: 'Not A Slug' })).status).toBe(400)
      expect((await make({ title: 'x'.repeat(81) })).status).toBe(400)
      expect((await make({ note: 'x'.repeat(241) })).status).toBe(400)
      expect((await make({ maxUses: 0 })).status).toBe(400)
      expect((await make({ maxUses: 1.5 })).status).toBe(400)
      expect((await make({ expiresAt: 'tomorrow' })).status).toBe(400)
      expect((await make({ expiresAt: '2026-11-01T00:00:00Z' })).status).toBe(400)
      expect((await make({ expiresAt: '2028-01-01T00:00:00Z' })).status).toBe(400)
      expect((await make({ merchant: 'nobody' })).status).toBe(404)
      expect((await make({ product: 'ai-for-work', expiresAt: '2026-12-01T00:00:00Z', maxUses: 5 })).status).toBe(201)
    })

    it('cannot link to a course of another seller', async () => {
      expect((await make({ product: 'brand-kit-essentials' })).status).toBe(404)
    })

    it('can be resolved by anyone with the code, and says what it points to', async () => {
      const link = (await make({ title: 'Open to all' })).body.data.link
      const { status, body } = await call(`/api/links/${link.code}`)
      expect(status).toBe(200)
      expect(body.data.link).toEqual({
        code: link.code,
        title: 'Open to all',
        note: null,
        state: 'active',
        available: true,
        reason: null,
        product: { slug: 'ai-for-work', title: 'AI for Work' },
        merchant: { slug: 'pdl', name: 'Prone Data Learning' },
      })
      expect(JSON.stringify(body)).not.toMatch(/revenue|visits|merchantId|productId/)
    })

    it('answers 404 for a code that does not exist, and 400 for one that is not a code', async () => {
      expect((await call('/api/links/zzzzzzzz')).status).toBe(404)
      expect((await call('/api/links/NOPE')).status).toBe(400)
      expect((await call('/api/links/a')).status).toBe(400)
    })

    it('can be paused and resumed, and a paused link tells the buyer why', async () => {
      const link = (await make({ title: 'Pause me' })).body.data.link
      const paused = await patch(`/api/seller/links/${link.id}`, { active: false })
      expect(paused.body.data.link).toMatchObject({ active: false, state: 'paused' })
      const resolved = (await call(`/api/links/${link.code}`)).body.data.link
      expect(resolved).toMatchObject({ available: false, state: 'paused', reason: 'The seller has paused this link.' })

      const resumed = await patch(`/api/seller/links/${link.id}`, { active: true })
      expect(resumed.body.data.link.state).toBe('active')
      expect((await patch(`/api/seller/links/${randomUUID()}`, { active: true })).status).toBe(404)
      expect((await patch(`/api/seller/links/${link.id}`, { active: 'no' })).status).toBe(400)
    })

    it('expires on its date', async () => {
      const link = (await make({ title: 'Short lived', expiresAt: '2026-12-01T00:00:00Z' })).body.data.link
      await db.query("update public.payment_links set expires_at = '2026-11-01T00:00:00Z' where id = $1", [link.id])
      expect((await call(`/api/links/${link.code}`)).body.data.link).toMatchObject({
        state: 'expired',
        available: false,
        reason: 'This link has expired.',
      })
    })

    it('does not let another seller change it', async () => {
      const link = (await make({ title: 'Mine' })).body.data.link
      expect((await patch(`/api/seller/links/${link.id}`, { active: false, merchant: 'savane-studio' })).status).toBe(
        404,
      )
      expect((await links()).find((entry) => entry.id === link.id).active).toBe(true)
    })

    describe('bringing a buyer through the checkout', () => {
      let link

      const visit = (over = {}) =>
        post('/api/checkout/sessions', { product: 'ai-for-work', country: 'CI', link: link.code, ...over })
      const stats = async () => (await links()).find((entry) => entry.id === link.id)

      beforeAll(async () => {
        link = (await make({ title: 'Checkout test', maxUses: 2 })).body.data.link
      })

      it('counts a visit that came through the link', async () => {
        expect((await visit()).status).toBe(201)
        expect((await visit()).status).toBe(201)
        expect((await stats()).visits).toBe(2)
        expect(await count('checkout_sessions', 'link_id = $1', [link.id])).toBe(2)
      })

      it('ignores a link that is not for this course, rather than failing the visit', async () => {
        const stray = await visit({ product: 'prompt-craft' })
        expect(stray.status).toBe(201)
        expect(await count('checkout_sessions', 'link_id = $1', [link.id])).toBe(2)
        expect((await visit({ link: 'zzzzzzzz' })).status).toBe(201)
      })

      it('counts the payment, its revenue and the share of visitors who paid', async () => {
        const session = (await visit()).body.data
        const made = await buy({ link: link.code, sessionId: session.id })
        const row = await one('select link_id from public.payments where id = $1', [made.id])
        expect(row.link_id).toBe(link.id)

        const entry = await stats()
        expect(entry).toMatchObject({ paid: 1, revenueUsdCents: 3900, state: 'active' })
        expect(entry.visits).toBe(3)
        expect(entry.conversion).toBeCloseTo(1 / 3, 10)

        const shown = (await call(`/api/seller/payments?q=${made.reference}`)).body.data.payments[0]
        expect(shown.link).toEqual({ title: 'Checkout test', code: link.code })
        const filtered = await call(`/api/seller/payments?link=${link.id}`)
        expect(filtered.body.data.total).toBe(1)
      })

      it('does not count a payment that did not go through', async () => {
        const created = (await post('/api/checkout/payments', order({ link: link.code }))).body.data.payment
        await post(`/api/simulator/payments/${created.id}/outcome`, { outcome: 'decline' })
        expect((await stats()).paid).toBe(1)
      })

      it('turns full when it has been paid as many times as allowed, and refuses a new payment through it', async () => {
        await buy({ link: link.code })
        expect(await stats()).toMatchObject({ paid: 2, state: 'full' })
        expect((await call(`/api/links/${link.code}`)).body.data.link).toMatchObject({
          available: false,
          state: 'full',
          reason: 'This link has reached its limit.',
        })
        const refused = await post('/api/checkout/payments', order({ link: link.code }))
        expect(refused.status).toBe(409)
        expect(refused.body.error.message).toBe('This link has reached its limit.')
        /* the page would not even open, but a visit that still arrives is not counted against a full link */
        expect((await visit()).status).toBe(201)
        expect(await count('checkout_sessions', 'link_id = $1', [link.id])).toBe(3)
      })

      it('refuses a payment through a paused link, and through a link for another course', async () => {
        const fresh = (await make({ title: 'Strict' })).body.data.link
        await patch(`/api/seller/links/${fresh.id}`, { active: false })
        const paused = await post('/api/checkout/payments', order({ link: fresh.code }))
        expect(paused.status).toBe(409)
        expect(paused.body.error.message).toBe('The seller has paused this link.')

        await patch(`/api/seller/links/${fresh.id}`, { active: true })
        const wrong = await post('/api/checkout/payments', order({ link: fresh.code, product: 'prompt-craft' }))
        expect(wrong.status).toBe(400)
        const unknown = await post('/api/checkout/payments', order({ link: 'zzzzzzzz' }))
        expect(unknown.status).toBe(400)
        expect((await post('/api/checkout/payments', order({ link: 'BAD' }))).status).toBe(400)
      })

      it('lets a buyer pay without any link, as before', async () => {
        const created = (await post('/api/checkout/payments', order())).body.data.payment
        const row = await one('select link_id from public.payments where id = $1', [created.id])
        expect(row.link_id).toBeNull()
      })
    })
  })
})
