/* The catalog API end to end: HTTP request, controller, service, repository, SQL, on an in-memory Postgres with the demo data. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'

const env = loadEnv({ NODE_ENV: 'test' })
const logger = createLogger({ level: 'silent' })

describe('catalog and health with a database', () => {
  let db
  let app

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    app = createApp({ env, logger, db })
  })
  afterAll(() => db.close())

  const get = async (path) => {
    const response = await app.request(path)
    return { status: response.status, body: await response.json() }
  }

  it('lists the courses of the demo seller', async () => {
    const { status, body } = await get('/api/catalog/products?merchant=pdl')
    expect(status).toBe(200)
    expect(body.data.merchant).toEqual({
      slug: 'pdl',
      name: 'Prone Data Learning',
      tagline: 'Courses in data, AI and automation.',
    })
    expect(body.data.products).toHaveLength(8)
    expect(body.data.products[0]).toEqual({
      id: expect.any(String),
      slug: expect.any(String),
      title: expect.any(String),
      subtitle: expect.any(String),
      summary: expect.any(String),
      category: expect.any(String),
      level: expect.stringMatching(/beginner|intermediate|advanced/),
      lessons: expect.any(Number),
      hours: expect.any(Number),
      priceUsdCents: expect.any(Number),
      cover: expect.any(String),
    })
    expect(new Set(body.data.products.map((p) => p.category))).toEqual(new Set(['ai', 'automation', 'data']))
  })

  it('uses the demo seller when none is named', async () => {
    const { body } = await get('/api/catalog/products')
    expect(body.data.merchant.slug).toBe('pdl')
  })

  it('answers 404 for an unknown seller and 400 for a malformed one', async () => {
    const unknown = await get('/api/catalog/products?merchant=nobody')
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('not_found')

    const malformed = await get('/api/catalog/products?merchant=Not%20Valid')
    expect(malformed.status).toBe(400)
    expect(malformed.body.error.details.merchant).toBeTruthy()
  })

  it('lists the ten countries with local prices data and the methods on offer', async () => {
    const { status, body } = await get('/api/catalog/countries?merchant=pdl')
    expect(status).toBe(200)
    expect(body.data.countries.map((c) => c.code)).toEqual(['CI', 'SN', 'CM', 'GN', 'ML', 'NG', 'GH', 'KE', 'ZA', 'MA'])
    const ci = body.data.countries[0]
    expect(ci).toMatchObject({ name: "Côte d'Ivoire", currency: 'XOF', minorUnits: 0, priceStep: 25, fxPerUsd: 600 })
    expect(ci.methods.map((m) => m.id)).toEqual(['mobile_money', 'voucher', 'card', 'paypal'])
  })

  it('offers PayPal and card in every country, and labels what is simulated', async () => {
    const { body } = await get('/api/catalog/countries?merchant=pdl')
    for (const country of body.data.countries) {
      const ids = country.methods.map((m) => m.id)
      expect(ids).toContain('paypal')
      expect(ids).toContain('card')
      for (const method of country.methods) expect(method.simulated).toBe(method.provider === 'simulated')
      expect(country.methods.filter((m) => m.simulated).every((m) => !['paypal', 'card'].includes(m.id))).toBe(true)
    }
  })

  it('hides the methods the seller has switched off', async () => {
    const { body } = await get('/api/catalog/countries?merchant=pdl')
    const ids = (code) => body.data.countries.find((c) => c.code === code).methods.map((m) => m.id)
    expect(ids('KE')).not.toContain('mobile_money')
    expect(ids('NG')).not.toContain('ussd')
    expect(ids('GH')).not.toContain('bank_transfer')
    expect(ids('KE')).toEqual(['bank_transfer', 'card', 'paypal'])
  })

  it('hides a method whose corridor is down, and shows it again when it recovers', async () => {
    await db.query(
      "update public.country_methods set status = 'down' where country_code = 'CI' and method_id = 'mobile_money'",
    )
    let { body } = await get('/api/catalog/countries?merchant=pdl')
    expect(body.data.countries[0].methods.map((m) => m.id)).not.toContain('mobile_money')

    await db.query(
      "update public.country_methods set status = 'operational' where country_code = 'CI' and method_id = 'mobile_money'",
    )
    ;({ body } = await get('/api/catalog/countries?merchant=pdl'))
    expect(body.data.countries[0].methods.map((m) => m.id)).toContain('mobile_money')
  })

  it('reports the database as connected', async () => {
    const { body } = await get('/api/health')
    expect(body.data.integrations.database).toBe('connected')
  })

  it('reports the database as unreachable when a query fails, and still answers', async () => {
    const broken = createApp({
      env,
      logger,
      db: {
        query: async () => {
          throw new Error('down')
        },
      },
    })
    const response = await broken.request('/api/health')
    expect(response.status).toBe(200)
    expect((await response.json()).data.integrations.database).toBe('unreachable')
  })
})

describe('catalog without a database', () => {
  const app = createApp({ env, logger, db: null })

  it('says the database is not connected yet, with a 503', async () => {
    const response = await app.request('/api/catalog/products')
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('unavailable')
  })

  it('reports it as not configured in the health check', async () => {
    const body = await (await app.request('/api/health')).json()
    expect(body.data.integrations.database).toBe('not_configured')
  })
})
