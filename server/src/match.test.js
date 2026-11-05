/* Method Match on the server: the methods of a country, best first, from how payments really ended. Real routes on an
   in-memory Postgres with the demo data. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { rankMethods } from './lib/match.js'

const logger = createLogger({ level: 'silent' })
const env = loadEnv({ NODE_ENV: 'test' })
const NOW = new Date('2026-11-04T13:00:00Z')
const SINCE = '2026-10-05T13:00:00Z'

describe('Method Match', () => {
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

  let address = 0
  const match = async (query) => {
    address += 1
    const response = await app.request(`/api/checkout/match${query}`, {
      headers: { 'x-forwarded-for': `10.9.${address >> 8}.${address & 255}` },
    })
    return { status: response.status, body: await response.json() }
  }
  const run = (sql, params) => db.query(sql, params)

  /* How each method really did, counted straight from the payments. */
  async function outcomes(country) {
    const rows = await run(
      `select method_id, country_code,
              count(*) filter (where status in ('succeeded', 'refunded'))::int as paid,
              count(*) filter (where status in ('succeeded', 'refunded', 'failed'))::int as finished
         from public.payments where created_at >= $1 group by method_id, country_code`,
      [SINCE],
    )
    const local = new Map()
    const network = new Map()
    for (const row of rows) {
      const total = network.get(row.method_id) ?? { paid: 0, finished: 0 }
      total.paid += row.paid
      total.finished += row.finished
      network.set(row.method_id, total)
      if (row.country_code === country) local.set(row.method_id, { paid: row.paid, finished: row.finished })
    }
    return { local, network }
  }

  it('lists the methods a buyer can use in the country, best first, with the reason', async () => {
    const { status, body } = await match('?country=CI')
    expect(status).toBe(200)
    expect(body.data.country).toBe('CI')
    expect(body.data.days).toBe(30)
    expect(body.data.basis).toMatch(/last 30 days/)
    expect(body.data.basis).toMatch(/Demo data/)

    const ids = body.data.methods.map((method) => method.id)
    expect(ids.sort()).toEqual(['card', 'mobile_money', 'paypal', 'voucher'])
    const methods = body.data.methods
    expect(methods.map((method) => method.rank)).toEqual([1, 2, 3, 4])
    expect(methods.map((method) => method.best)).toEqual([true, false, false, false])
    for (const method of methods) {
      expect(method).toMatchObject({
        label: expect.any(String),
        reason: expect.any(String),
        sample: expect.any(Number),
        confidence: expect.stringMatching(/^(low|medium|high)$/),
      })
      expect(method.successRate).toBeGreaterThan(0)
      expect(method.successRate).toBeLessThanOrEqual(1)
    }
  })

  it('ranks the way the arithmetic says, from the real counts of the last thirty days', async () => {
    const { body } = await match('?country=CI')
    const { local, network } = await outcomes('CI')
    const offers = body.data.methods.map((method) => ({
      id: method.id,
      label: method.label,
      status: method.status,
      sort: 10,
    }))
    const expected = rankMethods(offers, { local, network })
    expect(body.data.methods.map((method) => method.id)).toEqual(expected.map((method) => method.id))
    for (const method of body.data.methods) {
      expect(method.sample).toBe(local.get(method.id)?.finished ?? 0)
    }
  })

  it('offers different methods in different countries, each ranked on its own record', async () => {
    const ci = (await match('?country=CI')).body.data.methods.map((method) => method.id)
    const ng = (await match('?country=NG')).body.data.methods.map((method) => method.id)
    expect(ci).not.toContain('bank_transfer')
    expect(ng).toContain('bank_transfer')
  })

  it('leaves out what the seller has switched off and what is down, and ranks a slow method lower', async () => {
    const ke = (await match('?country=KE')).body.data.methods.map((method) => method.id)
    expect(ke).not.toContain('mobile_money')

    const before = (await match('?country=SN')).body.data.methods
    const best = before[0].id
    await run("update public.country_methods set status = 'degraded' where country_code = 'SN' and method_id = $1", [
      best,
    ])
    const slowed = (await match('?country=SN')).body.data.methods
    expect(slowed.find((method) => method.id === best).reason).toBe('Slower than usual right now.')
    expect(slowed.find((method) => method.id === best).rank).toBeGreaterThan(1)

    await run("update public.country_methods set status = 'down' where country_code = 'SN' and method_id = $1", [best])
    expect((await match('?country=SN')).body.data.methods.map((method) => method.id)).not.toContain(best)
    await run("update public.country_methods set status = 'operational' where country_code = 'SN' and method_id = $1", [
      best,
    ])
  })

  it('does not count payments held or blocked for risk against a method', async () => {
    const before = (await match('?country=CI')).body.data.methods
    const buyer = (
      await run("insert into public.buyers (email, full_name, country_code) values ($1, 'Bulk', 'CI') returning id", [
        `bulk.${randomUUID()}@example.com`,
      ])
    )[0]
    const product = (await run('select id from public.products where merchant_id = $1 limit 1', [pdl]))[0]
    for (const status of ['blocked', 'in_review']) {
      for (let index = 0; index < 60; index += 1) {
        await run(
          `insert into public.payments
             (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency,
              display_amount_minor, fx_rate, fee_usd_cents, status, provider, origin, created_at)
           values ($1, $2, $3, $4, 'mobile_money', 'CI', 4900, 'XOF', 29400, 600, 100, $5, 'simulated', 'app', '2026-11-03T10:00:00Z')`,
          [`bulk_${randomUUID().slice(0, 10)}`, pdl, product.id, buyer.id, status],
        )
      }
    }
    const after = (await match('?country=CI')).body.data.methods
    expect(after.map((method) => [method.id, method.successRate, method.sample])).toEqual(
      before.map((method) => [method.id, method.successRate, method.sample]),
    )
  })

  it("works for another seller, with that seller's methods", async () => {
    const { status, body } = await match('?country=MA&merchant=savane-studio')
    expect(status).toBe(200)
    expect(body.data.methods.length).toBeGreaterThan(0)
  })

  it('carries nothing about any person', async () => {
    const { body } = await match('?country=GH')
    expect(JSON.stringify(body)).not.toMatch(/@|email|buyer/i)
  })

  it('refuses what it cannot answer', async () => {
    expect((await match('')).status).toBe(400)
    expect((await match('?country=Ghana')).status).toBe(400)
    expect((await match('?country=ci')).status).toBe(400)
    expect((await match('?country=ZZ')).body.error.message).toBe('We do not serve that country yet.')
    expect((await match('?country=ZZ')).status).toBe(400)
    expect((await match('?country=CI&merchant=nobody')).status).toBe(404)
    expect((await match('?country=CI&merchant=Bad Name')).status).toBe(400)
  })
})
