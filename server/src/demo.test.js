/* The demo director: one-click scenarios that go through the real pipeline, and a reset that writes a fresh seed dated
   today. Real routes on an in-memory Postgres with the demo data, with a stand-in for the AI. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { createContainer } from './container.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { COUNTRY_METHODS, MERCHANTS } from './db/seed/data.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { createRiskService } from './services/risk.service.js'

const logger = createLogger({ level: 'silent' })
const env = loadEnv({ NODE_ENV: 'test', OPENAI_API_KEY: ['test', 'key'].join('-') })
/* A December day: the seed must be dated from here, not from the day it was first written. */
const NOW = new Date('2026-12-10T12:00:00Z')
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

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

const paypal = () => ({
  enabled: false,
  clientToken: vi.fn(),
  createOrder: vi.fn(),
  captureOrder: vi.fn(),
  getOrder: vi.fn(),
  verifyWebhook: vi.fn(),
  createPayout: vi.fn(),
  getPayout: vi.fn(),
})

describe('demo director', () => {
  let db
  let app
  let openai

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: NOW }))
    await createRiskService({ db, ai: { enabled: false } }).scoreHistory()
    openai = { enabled: true, models: { agent: 'agent-model', fast: 'fast-model' }, respond: vi.fn() }
    app = createApp({ env, logger, db, paypal: paypal(), openai, now: () => NOW })
  })
  afterAll(() => db.close())

  beforeEach(() => {
    openai.respond.mockReset().mockResolvedValue(note('The signals suggest a throwaway email address was used.'))
  })

  let address = 0
  const call = async (path, init = {}, application = app) => {
    address += 1
    const headers = {
      ...init.headers,
      'x-forwarded-for': `10.${address >> 16}.${(address >> 8) & 255}.${address & 255}`,
    }
    const response = await application.request(path, { ...init, headers })
    return { status: response.status, body: await response.json() }
  }
  const post = (path, body = {}, application) =>
    call(
      path,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      application,
    )
  const run = (id) => post(`/api/demo/scenarios/${id}/run`)
  const one = async (sql, params) => (await db.query(sql, params))[0]
  const count = async (table, where = 'true', params = []) =>
    (await one(`select count(*)::int as n from public.${table} where ${where}`, params)).n
  /* Scenarios run in seconds, so one would see the last one's burst. This ages what is recent by a day, as time would. */
  const calm = () =>
    db.query(
      "update public.payments set created_at = created_at - interval '1 day' where created_at > now() - interval '10 minutes'",
    )
  const state = async () => (await call('/api/demo/state')).body.data
  const available = async (id) => (await state()).scenarios.find((scenario) => scenario.id === id)

  describe('state', () => {
    it('lists the eight scenarios and which of them can run now', async () => {
      const data = await state()
      expect(data).toMatchObject({ enabled: true, ai: true, waiting: 0 })
      expect(data.scenarios.map((scenario) => scenario.id)).toEqual([
        'sale',
        'failure',
        'rush',
        'suspicious',
        'attack',
        'outage',
        'recovery',
        'payday',
      ])
      expect(
        data.scenarios.filter((scenario) => !scenario.available).map((scenario) => [scenario.id, scenario.reason]),
      ).toEqual([['recovery', 'Nothing is down.']])
      for (const scenario of data.scenarios) {
        expect(scenario.title.length).toBeGreaterThan(3)
        expect(scenario.blurb).not.toMatch(LONG_DASH)
        expect(scenario.watch.length).toBeGreaterThan(0)
      }
    })

    it('counts what was made since the seed', async () => {
      const before = (await state()).made
      await run('sale')
      expect((await state()).made).toBe(before + 1)
    })
  })

  describe('scenarios', () => {
    it('a sale is a real payment that succeeds, with a real notification for the seller', async () => {
      const before = await count('notifications', "kind = 'sale'")
      const { status, body } = await run('sale')
      expect(status).toBe(200)
      const result = body.data
      expect(result).toMatchObject({ id: 'sale', title: 'A sale' })
      expect(result.headline).toMatch(/ paid \$\d+\.\d\d\.$/)
      expect(result.steps.every((step) => ['ok', 'warn', 'bad'].includes(step.tone))).toBe(true)
      expect(result.watch[0]).toEqual({ tab: 'seller', section: 'payments', label: 'Seller: Payments' })

      const payment = await one("select * from public.payments where origin = 'app' order by created_at desc limit 1")
      expect(payment).toMatchObject({ status: 'succeeded', provider: 'simulated' })
      expect(await count('notifications', "kind = 'sale'")).toBe(before + 1)
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
      expect(await count('risk_assessments', 'payment_id = $1', [payment.id])).toBe(1)
    })

    it('a failure is declined, with the buyer told why', async () => {
      const { body } = await run('failure')
      expect(body.data.steps.some((step) => step.tone === 'bad')).toBe(true)
      const payment = await one("select * from public.payments where origin = 'app' order by created_at desc limit 1")
      expect(payment.status).toBe('failed')
      expect(payment.failure_code).toMatch(/insufficient_funds|transfer_not_received|voucher_expired/)
      expect(await count('notifications', "kind = 'payment.failed' and payment_id = $1", [payment.id])).toBe(1)
    })

    it('a launch rush pays eighteen buyers, and the rules see a burst but hold nobody', async () => {
      const { body } = await run('rush')
      const result = body.data
      expect(result.headline).toMatch(/^18 of 18 buyers paid in \d+ seconds?\.$/)
      expect(result.steps.map((step) => step.tone)).toEqual(['ok', 'ok', 'ok'])
      expect(result.steps[1].text).toMatch(/noticed the burst on \d+ of them/)
      expect(result.steps[2].text).toBe('Nobody was held or blocked. A busy launch alone never holds anyone.')

      const made = await db.query(
        "select status from public.payments where origin = 'app' and created_at > now() - interval '2 minutes'",
      )
      expect(made.filter((row) => row.status === 'in_review' || row.status === 'blocked')).toHaveLength(0)
      expect(
        await count(
          'risk_assessments',
          `signals @> '[{"id":"seller_burst"}]'::jsonb and created_at > now() - interval '2 minutes'`,
        ),
      ).toBeGreaterThan(0)
    }, 60_000)

    it('a suspicious buyer is held for a person, with the AI note shown', async () => {
      await calm()
      const { body } = await run('suspicious')
      expect(body.data.headline).toBe('A payment from a throwaway email address was held for review.')
      expect(body.data.steps[0].text).toBe('The rules scored it 40 (medium): Throwaway email.')
      expect(body.data.steps[2].text).toBe(
        'The AI wrote the note: "The signals suggest a throwaway email address was used."',
      )

      const payment = await one("select * from public.payments where origin = 'app' order by created_at desc limit 1")
      expect(payment.status).toBe('in_review')
      const buyer = await one('select email from public.buyers where id = $1', [payment.buyer_id])
      expect(buyer.email).toMatch(/@mailinator\.com$/)
      expect(await count('notifications', "kind = 'risk.review' and payment_id = $1", [payment.id])).toBe(2)
    })

    it('says the rules wrote the note when the AI cannot', async () => {
      openai.respond.mockRejectedValue(Object.assign(new Error('down'), { name: 'AiError', unreachable: true }))
      const { body } = await run('suspicious')
      expect(body.data.steps[2].text).toBe('The rules wrote the note, since the AI was off, slow or over its budget.')
    })

    it('an attack holds the first attempts and blocks the last, and tells all three sides', async () => {
      await calm()
      const { body } = await run('attack')
      const result = body.data
      expect(result.headline).toBe('A bot made 4 attempts. The last one was blocked at once.')
      expect(result.steps.map((step) => step.tone)).toEqual(['warn', 'warn', 'warn', 'bad', 'ok'])
      expect(result.steps[0].text).toBe('Attempt 1: held for review (score 40).')
      expect(result.steps[3].text).toBe('Attempt 4: blocked at once (score 60).')

      const blocked = await one(
        "select * from public.payments where status = 'blocked' and origin = 'app' order by created_at desc limit 1",
      )
      const attempts = await db.query(
        'select status from public.payments where buyer_id = $1 order by created_at, id',
        [blocked.buyer_id],
      )
      expect(attempts.map((row) => row.status)).toEqual(['in_review', 'in_review', 'in_review', 'blocked'])
      const told = await db.query('select audience from public.notifications where payment_id = $1 order by audience', [
        blocked.id,
      ])
      expect(told.map((row) => row.audience)).toEqual(['admin', 'buyer', 'seller'])
      expect(blocked.failure_code).toBe('safety_check')
    })

    it('an outage takes a corridor down: sellers are told, buyers stop seeing it, Method Match moves on', async () => {
      const told = await count('notifications', "kind = 'corridor'")
      const { body } = await run('outage')
      expect(body.data.headline).toMatch(/^Mobile money in .+ is down\.$/)
      expect(body.data.steps[2].text).toMatch(/^Method Match now puts .+ first there\.$/)
      expect(await count('notifications', "kind = 'corridor'")).toBeGreaterThan(told)

      const down = await one(
        "select country_code from public.country_methods where method_id = 'mobile_money' and status = 'down'",
      )
      const order = (await call(`/api/checkout/match?country=${down.country_code}`)).body.data
      expect(order.methods.map((method) => method.id)).not.toContain('mobile_money')
      expect(
        await one(
          "select actor, actor_id from public.audit_log where action = 'corridor.changed' order by id desc limit 1",
        ),
      ).toEqual({
        actor: 'admin',
        actor_id: 'demo-director',
      })
      expect((await available('recovery')).available).toBe(true)
    })

    it('a second outage picks another country, and recovery brings every one back', async () => {
      await run('outage')
      expect(await count('country_methods', "status = 'down'")).toBe(2)
      const { body } = await run('recovery')
      expect(body.data.headline).toBe('2 corridors are working again.')
      expect(await count('country_methods', "status <> 'operational'")).toBe(0)
      const again = await run('recovery')
      expect(again.status).toBe(409)
      expect(again.body.error.message).toBe('Nothing is down.')
    })

    it('payday pays out what the seller is owed, once', async () => {
      const owed = await one(
        "select coalesce(sum(net_usd_cents), 0)::int as n from public.payments where merchant_id = (select id from public.merchants where slug = 'pdl') and status = 'succeeded' and payout_id is null",
      )
      expect(owed.n).toBeGreaterThan(0)
      const { body } = await run('payday')
      expect(body.data.headline).toMatch(/^\$[\d,]+\.\d\d paid out for \d+ sales\.$/)
      const again = await run('payday')
      expect(again.status).toBe(409)
      expect(again.body.error.message).toBe('The seller is paid up. Make a sale first.')
    })

    it('refuses an attack when the review queue is already crowded', async () => {
      for (let index = 0; index < 3; index += 1) await run('attack')
      for (let index = 0; index < 3; index += 1) await run('suspicious')
      expect((await state()).waiting).toBeGreaterThanOrEqual(12)
      const refused = await run('attack')
      expect(refused.status).toBe(409)
      expect(refused.body.error.message).toMatch(
        /^The review queue already has \d+ payments\. Decide them first, or reset the demo\.$/,
      )
      expect((await available('suspicious')).available).toBe(false)
      expect((await available('sale')).available).toBe(true)
    }, 60_000)

    it('knows its scenarios, and writes each run to the audit log', async () => {
      expect((await run('nope')).status).toBe(404)
      expect((await run('SALE')).status).toBe(400)
      expect((await run('x')).status).toBe(400)
      const before = await count('audit_log', "action = 'scenario.run'")
      await run('sale')
      expect(await count('audit_log', "action = 'scenario.run'")).toBe(before + 1)
    })

    it('runs one scenario at a time', async () => {
      const container = createContainer({ env, db, logger, paypal: paypal(), openai, now: () => NOW })
      const first = container.services.demo.run('sale')
      await expect(container.services.demo.run('failure')).rejects.toMatchObject({
        status: 409,
        message: 'Another scenario is running. Wait a moment.',
      })
      await expect(container.services.demo.reset()).rejects.toMatchObject({ status: 409 })
      await first
    })

    it('limits how often scenarios can be run', async () => {
      const statuses = []
      for (let index = 0; index < 11; index += 1) {
        const response = await app.request('/api/demo/scenarios/recovery/run', {
          method: 'POST',
          headers: { 'x-forwarded-for': '10.250.0.1' },
        })
        statuses.push(response.status)
      }
      expect(statuses.slice(0, 10).every((status) => status === 409)).toBe(true)
      expect(statuses[10]).toBe(429)
    })
  })

  describe('reset', () => {
    it('must be confirmed', async () => {
      expect((await post('/api/demo/reset', {})).status).toBe(400)
      expect((await post('/api/demo/reset', { confirm: false })).status).toBe(400)
      expect((await post('/api/demo/reset', { confirm: 'yes' })).status).toBe(400)
    })

    it('wipes what was made and writes a fresh seed dated today, keeping the AI count of the day', async () => {
      await run('sale')
      await run('suspicious')
      await run('outage')
      await db.query(
        "update public.merchant_methods set enabled = true where country_code = 'KE' and method_id = 'mobile_money'",
      )
      await db.query(
        "insert into public.ai_usage (feature, model, input_tokens, output_tokens, created_at) values ('test', 'm', 1000, 500, $1)",
        [NOW.toISOString()],
      )
      const usage = await one(
        "select coalesce(sum(input_tokens + output_tokens), 0)::int as n from public.ai_usage where created_at >= '2026-12-10'",
      )
      expect(usage.n).toBeGreaterThanOrEqual(1500)
      expect(await count('payments', "origin = 'app'")).toBeGreaterThan(0)

      const { status, body } = await post('/api/demo/reset', { confirm: true })
      expect(status).toBe(200)
      const fresh = buildSeed({ now: NOW })
      expect(body.data).toMatchObject({ payments: fresh.payments.length, merchants: 5, scored: fresh.payments.length })

      expect(await count('payments')).toBe(fresh.payments.length)
      expect(await count('payments', "origin = 'app'")).toBe(0)
      expect(await count('payments', "status in ('in_review', 'blocked')")).toBe(0)
      expect(await count('checkout_sessions', "origin = 'app'")).toBe(0)
      expect(await count('payouts', "origin = 'app'")).toBe(0)
      expect(await count('payment_links')).toBe(0)
      expect(await count('copilot_actions')).toBe(0)
      expect(await count('buyers')).toBe(fresh.buyers.length)
      expect(await count('notifications')).toBe(fresh.notifications.length)
      expect(await count('risk_assessments')).toBe(fresh.payments.length)

      const after = await one(
        "select coalesce(sum(input_tokens + output_tokens), 0)::int as n from public.ai_usage where created_at >= '2026-12-10'",
      )
      expect(after.n).toBe(usage.n)
    }, 60_000)

    it("puts the sellers' methods and the corridors back as the seed has them", async () => {
      const on = (code, id) => {
        const config = MERCHANTS.find((merchant) => merchant.slug === 'pdl')
        return !config.off.includes(`${code}:${id}`)
      }
      const rows = await db.query(
        `select mm.country_code, mm.method_id, mm.enabled from public.merchant_methods mm
           join public.merchants m on m.id = mm.merchant_id where m.slug = 'pdl'`,
      )
      expect(rows).toHaveLength(Object.values(COUNTRY_METHODS).flat().length)
      for (const row of rows)
        expect(row.enabled, `${row.country_code}:${row.method_id}`).toBe(on(row.country_code, row.method_id))
      expect(await count('country_methods', "status <> 'operational' or not enabled")).toBe(0)
    })

    it('dates the history up to today, so the dashboards are never empty', async () => {
      const latest = await one('select max(created_at) as at, min(created_at) as first from public.payments')
      expect(new Date(latest.at).getTime()).toBeGreaterThan(NOW.getTime() - 2 * 3_600_000)
      expect(new Date(latest.at).getTime()).toBeLessThanOrEqual(NOW.getTime())
      expect(new Date(latest.first).getTime()).toBeLessThan(NOW.getTime() - 85 * 86_400_000)

      const overview = (await call('/api/seller/overview')).body.data
      expect(overview.kpis.payments.value).toBeGreaterThan(100)
      expect(overview.range.to).toBe('2026-12-11T00:00:00.000Z')
      const admin = (await call('/api/admin/overview')).body.data
      expect(admin.risk.scored).toBeGreaterThan(100)
    })

    it('leaves one audit entry for the seed and one for the reset', async () => {
      const actions = await db.query('select action from public.audit_log order by id')
      expect(actions.map((row) => row.action)).toEqual(['demo.seeded', 'demo.reset'])
    })

    it('sends everyone with the app open one signal, which carries nothing but the word', async () => {
      await db.query('delete from realtime.sent')
      await db.query("delete from public.audit_log where action = 'demo.reset'")
      expect((await post('/api/demo/reset', { confirm: true })).status).toBe(200)
      const sent = await db.query("select payload from realtime.sent where payload->>'table' = 'demo'")
      expect(sent.map((row) => row.payload)).toEqual([{ table: 'demo', op: 'RESET' }])
    }, 60_000)

    it("cannot be repeated within a minute, by the database's own clock", async () => {
      const again = await post('/api/demo/reset', { confirm: true })
      expect(again.status).toBe(429)
      expect(again.body.error.message).toBe('The demo was reset a moment ago. Try again in a minute.')
      /* a fresh address does not help: the cooldown is in the database, not in the rate limiter */
      expect((await post('/api/demo/reset', { confirm: true })).status).toBe(429)
    })

    it('can run scenarios again straight after', async () => {
      expect((await run('sale')).status).toBe(200)
      expect((await state()).made).toBe(1)
    })
  })

  describe('on a database with no data, as a new deployment is', () => {
    it('offers only a reset, and the reset writes the seed', async () => {
      const bare = await createTestDb()
      await migrate(bare)
      const fresh = createApp({ env, logger, db: bare, paypal: paypal(), openai, now: () => NOW })
      const data = (await call('/api/demo/state', {}, fresh)).body.data
      expect(data).toMatchObject({ enabled: true, empty: true, made: 0, waiting: 0 })
      expect(data.scenarios).toHaveLength(8)
      expect(data.scenarios.every((scenario) => !scenario.available)).toBe(true)
      expect(data.scenarios[0].reason).toBe('The demo has no data yet. Reset the demo to write it.')
      expect((await post('/api/demo/scenarios/sale/run', {}, fresh)).status).toBe(404)

      const reset = await post('/api/demo/reset', { confirm: true }, fresh)
      expect(reset.status).toBe(200)
      expect(reset.body.data.merchants).toBe(5)
      const after = (await call('/api/demo/state', {}, fresh)).body.data
      expect(after.empty).toBeUndefined()
      expect(after.scenarios.find((scenario) => scenario.id === 'sale').available).toBe(true)
      const scored = (await bare.query('select count(*)::int as n from public.risk_assessments'))[0].n
      expect(scored).toBe(fresh && buildSeed({ now: NOW }).payments.length)
      await bare.close()
    }, 60_000)
  })

  describe('when the demo tools are off', () => {
    it('says so, and runs and wipes nothing', async () => {
      const off = createApp({
        env: loadEnv({ NODE_ENV: 'test', DEMO_TOOLS: 'false' }),
        logger,
        db,
        paypal: paypal(),
        now: () => NOW,
      })
      expect((await call('/api/demo/state', {}, off)).body.data).toEqual({
        enabled: false,
        made: 0,
        waiting: 0,
        scenarios: [],
      })
      expect((await post('/api/demo/scenarios/sale/run', {}, off)).status).toBe(404)
      const before = await count('payments')
      expect((await post('/api/demo/reset', { confirm: true }, off)).status).toBe(404)
      expect(await count('payments')).toBe(before)
    })
  })

  it('never uses a long dash in what it says', async () => {
    const result = (await run('sale')).body.data
    expect(JSON.stringify(result)).not.toMatch(LONG_DASH)
    expect(randomUUID()).toBeTruthy()
  })
})
