/* The admin API: overview, transactions, the review queue, sellers, corridors, settlements, fairness and the audit log.
   Real routes on an in-memory Postgres with the demo data and its history scored. The clock is fixed, so "the last 30
   days" is the same period every run. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { NEVER_USED, RISK_INPUTS, RULES } from './lib/risk.js'
import { createRiskService } from './services/risk.service.js'

const logger = createLogger({ level: 'silent' })
const env = loadEnv({ NODE_ENV: 'test' })
const NOW = new Date('2026-11-04T13:00:00Z')
const WINDOW = { from: '2026-10-06T00:00:00Z', to: '2026-11-05T00:00:00Z' }

describe('admin', () => {
  let db
  let app
  let risk
  let pdl

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    risk = createRiskService({ db, ai: { enabled: false } })
    await risk.scoreHistory()
    app = createApp({ env, logger, db, now: () => NOW })
    pdl = (await db.query("select id from public.merchants where slug = 'pdl'"))[0].id
  })
  afterAll(() => db.close())

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
  const order = (over = {}) => ({
    idempotencyKey: randomUUID(),
    product: 'ai-for-work',
    country: 'CI',
    method: 'mobile_money',
    buyer: { name: 'Test Buyer', email: `buyer.${++n}.${randomUUID().slice(0, 8)}@mailinator.com` },
    ...over,
  })
  /* A payment the rules hold for review (a throwaway email). */
  const held = async (over) => (await post('/api/checkout/payments', order(over))).body.data.payment

  /* A blocked payment inside the 30 day window, with a high score, written straight into the database. */
  async function plantBlocked(minutesBefore = 120) {
    const email = `planted.${++n}.${randomUUID().slice(0, 6)}@mailinator.com`
    const buyer = await one(
      "insert into public.buyers (email, full_name, country_code) values ($1, 'Planted Buyer', 'NG') returning id",
      [email],
    )
    const product = await one('select id from public.products where merchant_id = $1 limit 1', [pdl])
    const at = new Date(NOW.getTime() - minutesBefore * 60_000).toISOString()
    for (let index = 0; index < 3; index += 1) {
      await db.query(
        `insert into public.payments
           (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency,
            display_amount_minor, fx_rate, fee_usd_cents, status, failure_code, provider, origin, created_at, completed_at)
         values ($1, $2, $3, $4, 'mobile_money', 'NG', 4900, 'NGN', 7000000, 1450, 100, 'failed', 'insufficient_funds',
                 'simulated', 'app', $5::timestamptz - ($6 || ' minutes')::interval, $5)`,
        [`plant_${randomUUID().slice(0, 10)}`, pdl, product.id, buyer.id, at, String(index + 1)],
      )
    }
    const blocked = await one(
      `insert into public.payments
         (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency,
          display_amount_minor, fx_rate, fee_usd_cents, status, failure_code, provider, origin, created_at, completed_at)
       values ($1, $2, $3, $4, 'mobile_money', 'NG', 4900, 'NGN', 7000000, 1450, 100, 'blocked', 'safety_check',
               'simulated', 'app', $5, $5) returning id, reference`,
      [`plant_${randomUUID().slice(0, 10)}`, pdl, product.id, buyer.id, at],
    )
    await risk.scoreHistory()
    return blocked
  }

  describe('overview', () => {
    it('adds up the whole network for the last 30 days exactly as the database does', async () => {
      await plantBlocked()
      const { status, body } = await call('/api/admin/overview')
      expect(status).toBe(200)
      const data = body.data
      expect(data.range).toMatchObject({ days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' })

      const sql = await one(
        `select coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::int as gross,
                count(*) filter (where status = 'succeeded')::int as paid,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                count(*) filter (where status = 'blocked')::int as blocked,
                coalesce(sum(amount_usd_cents) filter (where status = 'blocked'), 0)::int as blocked_amount,
                count(distinct merchant_id) filter (where status = 'succeeded')::int as sellers
           from public.payments where created_at >= $1 and created_at < $2`,
        [WINDOW.from, WINDOW.to],
      )
      expect(sql.paid).toBeGreaterThan(500)
      expect(sql.blocked).toBeGreaterThanOrEqual(1)
      expect(data.kpis.gross.value).toBe(sql.gross)
      expect(data.kpis.payments.value).toBe(sql.paid)
      expect(data.kpis.successRate.value).toBeCloseTo(sql.paid / sql.finished, 10)
      expect(data.kpis.blocked.value).toBe(sql.blocked)
      expect(data.blockedUsdCents).toBe(sql.blocked_amount)
      expect(data.kpis.sellers.value).toBe(sql.sellers)
      expect(data.kpis.gross.previous).toBeGreaterThan(0)
    })

    it('draws a point a day that adds up to the totals', async () => {
      const { series, kpis } = (await call('/api/admin/overview')).body.data
      expect(series.days).toHaveLength(30)
      expect(series.gross).toHaveLength(30)
      expect(series.blocked).toHaveLength(30)
      expect(series.gross.reduce((a, b) => a + b, 0)).toBe(kpis.gross.value)
      expect(series.blocked.reduce((a, b) => a + b, 0)).toBe(kpis.blocked.value)
    })

    it('counts how the scored payments were rated', async () => {
      const { risk: mix } = (await call('/api/admin/overview')).body.data
      const sql = await one(
        "select count(*)::int as scored, count(*) filter (where level = 'high')::int as high from public.risk_assessments where created_at >= $1 and created_at < $2",
        [WINDOW.from, WINDOW.to],
      )
      expect(mix.scored).toBe(sql.scored)
      expect(mix.low + mix.medium + mix.high).toBe(mix.scored)
      expect(mix.high).toBe(sql.high)
    })

    it('shows the payments the rules acted on, with the reason in words', async () => {
      const { flagged } = (await call('/api/admin/overview')).body.data
      expect(flagged.length).toBeGreaterThanOrEqual(1)
      for (const entry of flagged) {
        expect(entry.risk.level).not.toBe('low')
        expect(entry.explanation).toEqual(expect.any(String))
      }
    })

    it('counts the corridors by health, and what is waiting for a review', async () => {
      const waiting = await held()
      const { corridors, queue } = (await call('/api/admin/overview')).body.data
      const sql = await one(
        `select count(*) filter (where cm.status = 'operational')::int as ok from public.country_methods cm
           join public.countries c on c.code = cm.country_code and c.active where cm.enabled`,
      )
      expect(corridors.operational).toBe(sql.ok)
      expect(queue.waiting).toBeGreaterThanOrEqual(1)
      expect(queue.oldestAt).not.toBeNull()
      expect(waiting.status).toBe('in_review')
    })

    it('points out what needs a person, in plain words', async () => {
      const { attention } = (await call('/api/admin/overview')).body.data
      expect(attention.some((item) => item.kind === 'review')).toBe(true)
      expect(attention.length).toBeLessThanOrEqual(4)
      const dash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
      for (const item of attention) expect(item.message).not.toMatch(dash)
    })

    it('says whether the AI is on and how much of the day it has used', async () => {
      const { ai } = (await call('/api/admin/overview')).body.data
      expect(ai).toEqual({ enabled: false, usedTokens: 0, dailyTokenBudget: env.ai.dailyTokenBudget })
    })

    it('only takes 7, 30 or 90 days', async () => {
      expect((await call('/api/admin/overview?days=7')).status).toBe(200)
      expect((await call('/api/admin/overview?days=14')).status).toBe(400)
    })
  })

  describe('transactions', () => {
    it('lists every payment of every seller with its rating', async () => {
      const { status, body } = await call('/api/admin/transactions?limit=1000')
      expect(status).toBe(200)
      expect(body.data.total).toBe(await count('payments'))
      expect(body.data.shown).toBe(1000)
      const sellers = new Set(body.data.payments.map((payment) => payment.merchant.slug))
      expect(sellers.size).toBeGreaterThan(1)
      expect(body.data.payments[0]).toMatchObject({
        merchant: { slug: expect.any(String), name: expect.any(String) },
        buyer: { email: expect.any(String) },
        risk: { level: expect.any(String), score: expect.any(Number) },
      })
    })

    it('filters by status, seller, method, country, rating and search', async () => {
      const by = async (query) => (await call(`/api/admin/transactions?${query}&limit=1000`)).body.data
      const blocked = await by('status=blocked')
      expect(blocked.total).toBe(await count('payments', "status = 'blocked'"))
      expect(blocked.payments.every((payment) => payment.status === 'blocked')).toBe(true)

      const seller = await by('merchant=pdl')
      expect(seller.total).toBe(await count('payments', 'merchant_id = $1', [pdl]))

      const method = await by('method=card')
      expect(method.payments.every((payment) => payment.method.id === 'card')).toBe(true)

      const country = await by('country=GH')
      expect(country.payments.every((payment) => payment.country.code === 'GH')).toBe(true)

      const high = await by('level=high')
      expect(high.total).toBe(await count('risk_assessments', "level = 'high'"))

      const one = await by('q=planted')
      expect(one.payments.every((payment) => /planted/i.test(payment.buyer.email + payment.buyer.name))).toBe(true)
      expect(one.total).toBeGreaterThanOrEqual(1)
    })

    it('narrows to a day range, in UTC', async () => {
      const day = (await call('/api/admin/transactions?from=2026-10-20&to=2026-10-20&limit=1000')).body.data
      const sql = await count(
        'payments',
        "created_at >= '2026-10-20T00:00:00Z' and created_at < '2026-10-21T00:00:00Z'",
      )
      expect(day.total).toBe(sql)
      expect(day.total).toBeGreaterThan(0)
    })

    it('sorts by risk, amount and date, and pages', async () => {
      const risky = (await call('/api/admin/transactions?sort=risk&limit=20')).body.data.payments
      const scores = risky.map((payment) => payment.risk?.score ?? -1)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))

      const big = (await call('/api/admin/transactions?sort=amount&limit=10')).body.data.payments
      expect(big.map((payment) => payment.amountUsdCents)).toEqual(
        [...big.map((payment) => payment.amountUsdCents)].sort((a, b) => b - a),
      )

      const first = (await call('/api/admin/transactions?limit=5&offset=0')).body.data.payments
      const next = (await call('/api/admin/transactions?limit=5&offset=5')).body.data.payments
      expect(next[0].id).not.toBe(first[0].id)
      expect(first).toHaveLength(5)
    })

    it('refuses filters it does not know', async () => {
      expect((await call('/api/admin/transactions?status=nope')).status).toBe(400)
      expect((await call('/api/admin/transactions?level=extreme')).status).toBe(400)
      expect((await call('/api/admin/transactions?country=Kenya')).status).toBe(400)
      expect((await call('/api/admin/transactions?sort=random')).status).toBe(400)
      expect((await call('/api/admin/transactions?limit=100000')).status).toBe(400)
    })

    it('opens one payment with its timeline and the full rating', async () => {
      const payment = await held()
      const { status, body } = await call(`/api/admin/transactions/${payment.id}`)
      expect(status).toBe(200)
      expect(body.data.payment).toMatchObject({
        id: payment.id,
        status: 'in_review',
        risk: { level: 'medium', decision: 'review' },
      })
      expect(body.data.timeline.map((entry) => entry.label)).toEqual(['Payment started', 'Held for a safety check'])
      expect(body.data.assessment).toMatchObject({
        score: 40,
        level: 'medium',
        enforced: true,
        explanationSource: 'rules',
        review: null,
      })
      expect(body.data.assessment.signals[0]).toMatchObject({ id: 'throwaway_email', points: 40 })
    })

    it('opens an old payment that was scored afterwards', async () => {
      const old = await one("select id from public.payments where status = 'succeeded' order by created_at limit 1")
      const { body } = await call(`/api/admin/transactions/${old.id}`)
      expect(body.data.assessment).toMatchObject({ level: expect.any(String), enforced: true })
    })

    it('says so for an unknown or malformed id', async () => {
      expect((await call(`/api/admin/transactions/${randomUUID()}`)).status).toBe(404)
      expect((await call('/api/admin/transactions/abc')).status).toBe(400)
    })
  })

  describe('review', () => {
    it('lists what is waiting, oldest first, with what the rules found', async () => {
      const first = await held()
      const second = await held()
      const { status, body } = await call('/api/admin/review')
      expect(status).toBe(200)
      const ids = body.data.queue.map((entry) => entry.id)
      expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(second.id))
      expect(body.data.waiting).toBe(body.data.queue.length)
      const entry = body.data.queue.find((item) => item.id === first.id)
      expect(entry.assessment.signals[0].id).toBe('throwaway_email')
      expect(entry.assessment.explanation).toMatch(/^Held for review\./)
      expect(entry.assessment.explanationSource).toBe('rules')
      expect(entry.buyer.email).toMatch(/mailinator/)
    })

    it('moves a decided payment from the queue to the recent decisions', async () => {
      const payment = await held()
      await post(`/api/admin/review/${payment.id}/approve`, { note: 'Fine' })
      const { body } = await call('/api/admin/review')
      expect(body.data.queue.map((entry) => entry.id)).not.toContain(payment.id)
      const done = body.data.recent.find((entry) => entry.id === payment.id)
      expect(done.review).toMatchObject({ decision: 'approved', note: 'Fine' })
      expect(done.review.at).not.toBeNull()
    })

    it('approves and rejects through the admin routes', async () => {
      const a = await held()
      const b = await held()
      expect((await post(`/api/admin/review/${a.id}/approve`, {})).body.data.payment.status).toBe('processing')
      expect((await post(`/api/admin/review/${b.id}/reject`, {})).body.data.payment).toMatchObject({
        status: 'blocked',
        failureCode: 'safety_check',
      })
    })
  })

  describe('sellers', () => {
    it('lists every seller with what they sold, how reliably, and what they are owed', async () => {
      const { status, body } = await call('/api/admin/merchants')
      expect(status).toBe(200)
      expect(body.data.merchants).toHaveLength(5)
      const mine = body.data.merchants.find((merchant) => merchant.slug === 'pdl')
      const sql = await one(
        `select count(*) filter (where status = 'succeeded')::int as paid,
                coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::int as gross,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                count(*) filter (where status = 'blocked')::int as blocked
           from public.payments where merchant_id = $1 and created_at >= $2 and created_at < $3`,
        [pdl, WINDOW.from, WINDOW.to],
      )
      expect(mine).toMatchObject({
        name: 'Prone Data Learning',
        status: 'active',
        paid: sql.paid,
        grossUsdCents: sql.gross,
        blocked: sql.blocked,
      })
      expect(mine.successRate).toBeCloseTo(sql.paid / sql.finished, 10)
      const owed = await one(
        "select coalesce(sum(net_usd_cents), 0)::int as owed from public.payments where merchant_id = $1 and status = 'succeeded' and payout_id is null",
        [pdl],
      )
      expect(mine.owedUsdCents).toBe(owed.owed)
      expect(mine.products).toBeGreaterThan(0)
      const gross = body.data.merchants.map((merchant) => merchant.grossUsdCents)
      expect(gross).toEqual([...gross].sort((a, b) => b - a))
    })

    it('takes 7, 30 or 90 days', async () => {
      expect((await call('/api/admin/merchants?days=90')).status).toBe(200)
      expect((await call('/api/admin/merchants?days=3')).status).toBe(400)
    })
  })

  describe('corridors', () => {
    it('lists every country and method with how it is doing', async () => {
      const { body } = await call('/api/admin/corridors')
      const total = await count('country_methods')
      expect(body.data.corridors).toHaveLength(total)
      expect(body.data.summary.operational + body.data.summary.degraded + body.data.summary.down).toBe(total)
      const ci = body.data.corridors.find((entry) => entry.countryCode === 'CI' && entry.method.id === 'mobile_money')
      expect(ci).toMatchObject({ enabled: true, status: 'operational', simulated: true, countryName: "Côte d'Ivoire" })
      expect(ci.successRate).toBeGreaterThan(0.5)
      expect(ci.sellersOn).toBeGreaterThanOrEqual(1)
    })

    it('changes a corridor, writes the audit log and tells every seller that uses it', async () => {
      const sellers = await count('merchant_methods', "country_code = 'SN' and method_id = 'ussd' and enabled")
      const sent = await count('notifications', "kind = 'corridor'")
      const { status, body } = await patch('/api/admin/corridors/SN/methods/mobile_money', { status: 'degraded' })
      expect(status).toBe(200)
      expect(body.data.corridor).toEqual({
        countryCode: 'SN',
        methodId: 'mobile_money',
        status: 'degraded',
        enabled: true,
      })
      expect(
        await one("select status from public.country_methods where country_code = 'SN' and method_id = 'mobile_money'"),
      ).toEqual({ status: 'degraded' })

      const audit = await one(
        "select actor, data from public.audit_log where action = 'corridor.changed' order by id desc limit 1",
      )
      expect(audit.actor).toBe('admin')
      expect(audit.data).toMatchObject({ before: { status: 'operational' }, after: { status: 'degraded' } })

      const using = await count('merchant_methods', "country_code = 'SN' and method_id = 'mobile_money' and enabled")
      expect(using).toBeGreaterThan(0)
      expect(await count('notifications', "kind = 'corridor'")).toBe(sent + using)
      const note = await one(
        "select title, body, level from public.notifications where kind = 'corridor' order by created_at desc limit 1",
      )
      expect(note.title).toBe('Mobile money in Senegal is slow')
      expect(note.level).toBe('warning')
      expect(sellers).toBeGreaterThanOrEqual(0)

      await patch('/api/admin/corridors/SN/methods/mobile_money', { status: 'operational' })
    })

    it('stops buyers from paying with a corridor that is down, and brings it back', async () => {
      const before = await count('audit_log', "action = 'corridor.changed'")
      await patch('/api/admin/corridors/CM/methods/mobile_money', { status: 'down' })
      const refused = await post(
        '/api/checkout/payments',
        order({ country: 'CM', buyer: { name: 'Buyer', email: `ok.${++n}@example.com` } }),
      )
      expect(refused.status).toBe(400)
      expect(refused.body.error.message).toMatch(/not available/)
      const match = (await call('/api/checkout/match?country=CM')).body.data
      expect(match.methods.map((entry) => entry.id)).not.toContain('mobile_money')

      await patch('/api/admin/corridors/CM/methods/mobile_money', { status: 'operational' })
      const allowed = await post(
        '/api/checkout/payments',
        order({ country: 'CM', buyer: { name: 'Buyer', email: `ok.${++n}@example.com` } }),
      )
      expect(allowed.status).toBe(201)
      expect(await count('audit_log', "action = 'corridor.changed'")).toBe(before + 2)
      const last = await one(
        "select title from public.notifications where kind = 'corridor' order by created_at desc limit 1",
      )
      expect(last.title).toBe('Mobile money in Cameroon is working again')
    })

    it('can pause a method for everyone and open it again', async () => {
      await patch('/api/admin/corridors/GN/methods/voucher', { enabled: false })
      expect((await call('/api/checkout/match?country=GN')).body.data.methods.map((entry) => entry.id)).not.toContain(
        'voucher',
      )
      expect(
        (await one("select title from public.notifications where kind = 'corridor' order by created_at desc limit 1"))
          .title,
      ).toBe('Cash voucher in Guinea is paused')
      await patch('/api/admin/corridors/GN/methods/voucher', { enabled: true })
      expect((await call('/api/checkout/match?country=GN')).body.data.methods.map((entry) => entry.id)).toContain(
        'voucher',
      )
    })

    it('does nothing, and writes nothing, when nothing changes', async () => {
      const audit = await count('audit_log')
      const notes = await count('notifications')
      const { status } = await patch('/api/admin/corridors/CI/methods/mobile_money', {
        status: 'operational',
        enabled: true,
      })
      expect(status).toBe(200)
      expect(await count('audit_log')).toBe(audit)
      expect(await count('notifications')).toBe(notes)
    })

    it('refuses a change that makes no sense', async () => {
      expect((await patch('/api/admin/corridors/CI/methods/mobile_money', {})).status).toBe(400)
      expect((await patch('/api/admin/corridors/CI/methods/mobile_money', { status: 'broken' })).status).toBe(400)
      expect((await patch('/api/admin/corridors/CI/methods/ussd', { status: 'down' })).status).toBe(404)
      expect((await patch('/api/admin/corridors/XX/methods/card', { status: 'down' })).status).toBe(404)
      expect((await patch('/api/admin/corridors/Kenya/methods/card', { status: 'down' })).status).toBe(400)
    })
  })

  describe('settlements', () => {
    it('totals what has been paid, what is on its way and what is owed', async () => {
      const { status, body } = await call('/api/admin/settlements')
      expect(status).toBe(200)
      const sql = await one(
        `select coalesce(sum(amount_usd_cents) filter (where status = 'paid'), 0)::int as paid from public.payouts`,
      )
      const owed = await one(
        "select coalesce(sum(net_usd_cents), 0)::int as owed, count(*)::int as n from public.payments where status = 'succeeded' and payout_id is null",
      )
      expect(body.data.totals).toMatchObject({ paidUsdCents: sql.paid, owedUsdCents: owed.owed, owedPayments: owed.n })
      expect(body.data.payouts[0]).toMatchObject({ merchant: { slug: expect.any(String) }, simulated: true })
      expect(body.data.owed.reduce((sum, entry) => sum + entry.owedUsdCents, 0)).toBe(owed.owed)
    })

    it('pays out one seller, once, and writes it to the audit log', async () => {
      const before = (await call('/api/admin/settlements')).body.data
      const mine = before.owed.find((entry) => entry.slug === 'pdl')
      expect(mine.owedUsdCents).toBeGreaterThan(0)

      const { status, body } = await post('/api/admin/settlements/run', { merchant: 'pdl' })
      expect(status).toBe(200)
      expect(body.data.payouts.length).toBeGreaterThanOrEqual(1)

      const after = (await call('/api/admin/settlements')).body.data
      expect(after.owed.find((entry) => entry.slug === 'pdl')).toBeUndefined()
      expect(after.totals.owedUsdCents).toBe(before.totals.owedUsdCents - mine.owedUsdCents)
      expect(await count('audit_log', "action = 'settlement.run' and entity_id = 'pdl' and actor = 'admin'")).toBe(1)

      const again = await post('/api/admin/settlements/run', { merchant: 'pdl' })
      expect(again.body.data.payouts).toHaveLength(0)
    })

    it('knows its sellers', async () => {
      expect((await post('/api/admin/settlements/run', { merchant: 'nobody' })).status).toBe(404)
      expect((await post('/api/admin/settlements/run', { merchant: 'Bad Name' })).status).toBe(400)
      expect((await post('/api/admin/settlements/run', {})).status).toBe(400)
    })
  })

  describe('fairness', () => {
    it('lists the rules and inputs straight from the code that scores, and what is never used', async () => {
      const { body } = await call('/api/admin/fairness')
      const data = body.data
      expect(data.inputs.map((input) => input.id)).toEqual(RISK_INPUTS.map((input) => input.id))
      expect(data.rules.map((rule) => rule.id)).toEqual(RULES.map((rule) => rule.id))
      expect(data.neverUsed).toEqual([...NEVER_USED])
      expect(data.thresholds).toEqual({ medium: 30, high: 60 })
      expect(data.engine).toMatch(/^rules-/)
      expect(data.explainer.neverSees).toEqual(expect.arrayContaining(['Country', 'Buyer name']))
      for (const rule of data.rules) {
        for (const input of rule.inputs) expect(data.inputs.map((entry) => entry.id)).toContain(input)
      }
    })

    it('rates the payments of each country, and the numbers add up', async () => {
      const { countries, summary } = (await call('/api/admin/fairness')).body.data
      const sql = await one(
        'select count(*)::int as n from public.risk_assessments where created_at >= $1 and created_at < $2',
        [WINDOW.from, WINDOW.to],
      )
      expect(summary.assessed).toBe(sql.n)
      expect(countries.reduce((sum, entry) => sum + entry.assessed, 0)).toBe(sql.n)
      expect(countries.length).toBeGreaterThanOrEqual(8)
      for (const entry of countries) {
        expect(entry.flaggedRate).toBeCloseTo((entry.medium + entry.high) / entry.assessed, 10)
        expect(entry.averageScore).toBeGreaterThanOrEqual(0)
      }
    })

    it('names the widest gap between countries that have enough payments to compare', async () => {
      const { gap, countries } = (await call('/api/admin/fairness')).body.data
      expect(gap).not.toBeNull()
      const comparable = countries.filter((entry) => entry.assessed >= 30)
      const rates = comparable.map((entry) => entry.flaggedRate)
      expect(gap.points).toBeCloseTo(Math.max(...rates) - Math.min(...rates), 10)
      expect(gap.highest.flaggedRate).toBeGreaterThanOrEqual(gap.lowest.flaggedRate)
    })

    it('scores a real payment again as if it came from every country, and gets one answer', async () => {
      const { status, body } = await post('/api/admin/fairness/probe', {})
      expect(status).toBe(200)
      expect(body.data.identical).toBe(true)
      const countries = await count('countries', 'active')
      expect(body.data.results).toHaveLength(countries)
      expect(new Set(body.data.results.map((entry) => `${entry.score}:${entry.level}`)).size).toBe(1)
      expect(body.data.payment.reference).toEqual(expect.any(String))
    })

    it('can be pointed at a particular payment, and refuses one that is not there', async () => {
      const payment = await held()
      const { body } = await post('/api/admin/fairness/probe', { payment: payment.id })
      expect(body.data.payment.id).toBe(payment.id)
      expect(body.data.results.every((entry) => entry.score === 40 && entry.level === 'medium')).toBe(true)
      expect(body.data.fired[0]).toMatchObject({ id: 'throwaway_email' })
      expect((await post('/api/admin/fairness/probe', { payment: randomUUID() })).status).toBe(404)
      expect((await post('/api/admin/fairness/probe', { payment: 'abc' })).status).toBe(400)
    })
  })

  describe('audit log', () => {
    it('lists what happened, newest first, with who did it', async () => {
      const { status, body } = await call('/api/admin/audit')
      expect(status).toBe(200)
      expect(body.data.total).toBe(await count('audit_log'))
      const times = body.data.entries.map((entry) => entry.at)
      expect(times).toEqual([...times].sort().reverse())
      expect(body.data.entries[0]).toMatchObject({ actor: expect.any(String), action: expect.any(String) })
    })

    it('filters by who did it and searches what they did', async () => {
      const admin = (await call('/api/admin/audit?actor=admin')).body.data
      expect(admin.total).toBe(await count('audit_log', "actor = 'admin'"))
      expect(admin.entries.every((entry) => entry.actor === 'admin')).toBe(true)

      const found = (await call('/api/admin/audit?q=corridor')).body.data
      expect(found.entries.length).toBeGreaterThan(0)
      expect(found.entries.every((entry) => /corridor/.test(entry.action))).toBe(true)
    })

    it('pages, and treats % and _ in a search as plain characters', async () => {
      const first = (await call('/api/admin/audit?limit=2')).body.data.entries
      const second = (await call('/api/admin/audit?limit=2&offset=2')).body.data.entries
      expect(first).toHaveLength(2)
      expect(second[0].id).not.toBe(first[0].id)
      expect((await call('/api/admin/audit?q=%25')).body.data.entries).toHaveLength(0)
    })

    it('refuses an actor it does not know', async () => {
      expect((await call('/api/admin/audit?actor=robot')).status).toBe(400)
      expect((await call('/api/admin/audit?limit=9999')).status).toBe(400)
    })
  })
})
