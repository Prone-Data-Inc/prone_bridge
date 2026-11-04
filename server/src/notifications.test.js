/* The notifications API end to end, on an in-memory Postgres with the demo data. */
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
const STRANGER = '11111111-1111-4111-8111-111111111111'

describe('notifications', () => {
  let db
  let app

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    app = createApp({ env, logger, db })
  })
  afterAll(() => db.close())

  const call = async (path, init) => {
    const response = await app.request(path, init)
    return { status: response.status, body: await response.json() }
  }
  const post = (path, body) =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('lists the seller notifications, newest first', async () => {
    const { status, body } = await call('/api/notifications?audience=seller&merchant=pdl')
    expect(status).toBe(200)
    expect(body.data.items).toHaveLength(3)
    const dates = body.data.items.map((item) => item.createdAt)
    expect([...dates].sort().reverse()).toEqual(dates)
    expect(body.data.items[0]).toEqual({
      id: expect.any(String),
      audience: 'seller',
      kind: expect.any(String),
      level: expect.stringMatching(/info|success|warning|danger/),
      title: expect.any(String),
      body: expect.any(String),
      paymentId: null,
      readAt: expect.toSatisfy((value) => value === null || typeof value === 'string'),
      createdAt: expect.any(String),
    })
  })

  it('defaults the seller to the demo merchant', async () => {
    const { body } = await call('/api/notifications?audience=seller')
    expect(body.data.items).toHaveLength(3)
  })

  it('lists the admin notifications', async () => {
    const { body } = await call('/api/notifications?audience=admin')
    expect(body.data.items.every((item) => item.audience === 'admin')).toBe(true)
    expect(body.data.items.length).toBeGreaterThan(0)
  })

  it('gives a buyer with no notifications an empty list, and a buyer with no id too', async () => {
    expect((await call(`/api/notifications?audience=buyer&buyer=${STRANGER}`)).body.data.items).toEqual([])
    expect((await call('/api/notifications?audience=buyer')).body.data.items).toEqual([])
  })

  it('never shows one merchant the notifications of another', async () => {
    const { status, body } = await call('/api/notifications?audience=seller&merchant=savane-studio')
    expect(status).toBe(200)
    expect(body.data.items).toEqual([])
  })

  it('counts what is unread for each tab', async () => {
    const { body } = await call('/api/notifications/summary?merchant=pdl')
    expect(body.data).toEqual({ admin: 1, seller: 2, buyer: 0 })
  })

  it('marks one notification read, only inside its own scope', async () => {
    const { body: list } = await call('/api/notifications?audience=seller&merchant=pdl')
    const unread = list.data.items.find((item) => item.readAt === null)

    const wrongScope = await post('/api/notifications/read', {
      audience: 'seller',
      merchant: 'savane-studio',
      ids: [unread.id],
    })
    expect(wrongScope.body.data.marked).toBe(0)

    const right = await post('/api/notifications/read', { audience: 'seller', merchant: 'pdl', ids: [unread.id] })
    expect(right.body.data.marked).toBe(1)
    expect((await call('/api/notifications/summary?merchant=pdl')).body.data.seller).toBe(1)
  })

  it('marks everything in scope read when no ids are given', async () => {
    const { body } = await post('/api/notifications/read', { audience: 'seller', merchant: 'pdl' })
    expect(body.data.marked).toBe(1)
    const summary = (await call('/api/notifications/summary?merchant=pdl')).body.data
    expect(summary.seller).toBe(0)
    expect(summary.admin).toBe(1)
  })

  it('counts a new notification for the right tab and lets the buyer read theirs', async () => {
    const [buyer] = await db.query('select id from public.buyers limit 1')
    await db.query(
      "insert into public.notifications (audience, buyer_id, kind, title, body) values ('buyer', $1, 'payment.ok', 'You are in', 'Your course is ready.')",
      [buyer.id],
    )
    expect((await call(`/api/notifications/summary?buyer=${buyer.id}`)).body.data.buyer).toBe(1)
    expect((await call(`/api/notifications?audience=buyer&buyer=${buyer.id}`)).body.data.items[0].title).toBe(
      'You are in',
    )
    expect((await post('/api/notifications/read', { audience: 'buyer', buyer: buyer.id })).body.data.marked).toBe(1)
    expect((await call(`/api/notifications/summary?buyer=${buyer.id}`)).body.data.buyer).toBe(0)
  })

  it('rejects bad input with a clear 400', async () => {
    const audience = await call('/api/notifications?audience=nobody')
    expect(audience.status).toBe(400)
    expect(audience.body.error.details.audience).toBeTruthy()

    expect((await call('/api/notifications?audience=buyer&buyer=not-an-id')).status).toBe(400)
    expect((await call('/api/notifications?audience=admin&limit=500')).status).toBe(400)
    expect((await post('/api/notifications/read', { audience: 'admin', ids: [] })).status).toBe(400)
    expect((await call('/api/notifications/read', { method: 'POST', body: 'not json' })).status).toBe(400)
    expect((await call('/api/notifications?audience=seller&merchant=nobody')).status).toBe(404)
  })

  it('says the database is not connected when there is none', async () => {
    const bare = createApp({ env, logger, db: null })
    const response = await bare.request('/api/notifications?audience=admin')
    expect(response.status).toBe(503)
  })
})
