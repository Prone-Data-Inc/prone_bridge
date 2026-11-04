/* The buyer's side of the API, end to end: catalog, checkout, the payment simulator, unlocking a course, and the messages
   it sends. Runs on an in-memory Postgres with the demo data. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'

const env = loadEnv({ NODE_ENV: 'test' })
const logger = createLogger({ level: 'silent' })

describe('buyer checkout', () => {
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
  const patch = (path, body) =>
    call(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const one = async (sql, params) => (await db.query(sql, params))[0]
  const count = async (table, where = 'true', params = []) =>
    (await one(`select count(*)::int as n from public.${table} where ${where}`, params)).n

  let n = 0
  /* A unique buyer per test, so one test never owns what another wants to buy. */
  const buyer = (over = {}) => ({
    name: 'Aminata Diallo',
    email: `aminata.${++n}.${randomUUID().slice(0, 8)}@example.com`,
    ...over,
  })
  const order = (over = {}) => ({
    idempotencyKey: randomUUID(),
    product: 'ai-for-work',
    country: 'CI',
    method: 'mobile_money',
    buyer: buyer(),
    ...over,
  })
  const pay = (over) => post('/api/checkout/payments', order(over))
  const settle = (id, outcome) => post(`/api/simulator/payments/${id}/outcome`, { outcome })

  beforeEach(async () => {
    await db.query('delete from realtime.sent')
  })

  describe('catalog', () => {
    it('shows one course in full', async () => {
      const { status, body } = await call('/api/catalog/products/ai-for-work?merchant=pdl')
      expect(status).toBe(200)
      expect(body.data.merchant.slug).toBe('pdl')
      expect(body.data.product).toMatchObject({
        slug: 'ai-for-work',
        title: 'AI for Work',
        priceUsdCents: 3900,
        category: 'ai',
        level: 'beginner',
      })
    })

    it('answers 404 for a course that does not exist, and 400 for a bad name', async () => {
      expect((await call('/api/catalog/products/nothing')).status).toBe(404)
      expect((await call('/api/catalog/products/Not%20Valid')).status).toBe(400)
      expect((await call('/api/catalog/products/ai-for-work?merchant=nobody')).status).toBe(404)
    })
  })

  describe('creating a payment', () => {
    it('takes the price from the database and works out the local amount on the server', async () => {
      const { status, body } = await post('/api/checkout/payments', {
        ...order(),
        amount: 1,
        amountUsdCents: 1,
        displayAmountMinor: 1,
      })
      expect(status).toBe(201)
      const { payment } = body.data
      expect(payment).toMatchObject({
        status: 'processing',
        provider: 'simulated',
        simulated: true,
        amountUsdCents: 3900,
        displayCurrency: 'XOF',
        displayAmountMinor: 23_400,
        fxRate: 600,
        method: { id: 'mobile_money', label: 'Mobile money' },
        country: { code: 'CI', name: "Côte d'Ivoire" },
        product: { slug: 'ai-for-work', title: 'AI for Work' },
      })
      expect(payment.reference).toMatch(/^pb_[A-HJKMNP-TV-Z2-9]{12}$/)
    })

    it('prices each country in its own currency', async () => {
      const ng = (await pay({ country: 'NG', method: 'bank_transfer' })).body.data.payment
      expect(ng).toMatchObject({ displayCurrency: 'NGN', displayAmountMinor: 5_850_000 })
      const ma = (await pay({ country: 'MA', method: 'voucher' })).body.data.payment
      expect(ma).toMatchObject({ displayCurrency: 'MAD', displayAmountMinor: 36_700 })
    })

    it('keeps the seller fee out of what a buyer sees, and in the database', async () => {
      const { body } = await pay()
      expect(JSON.stringify(body)).not.toMatch(/fee/i)
      const row = await one('select fee_usd_cents, net_usd_cents, origin, status from public.payments where id = $1', [
        body.data.payment.id,
      ])
      expect(row).toEqual({ fee_usd_cents: 98, net_usd_cents: 3802, origin: 'app', status: 'processing' })
    })

    it('writes the first line of the timeline', async () => {
      const { body } = await pay()
      const events = await db.query('select type, actor, data from public.payment_events where payment_id = $1', [
        body.data.payment.id,
      ])
      expect(events).toEqual([{ type: 'created', actor: 'buyer', data: { method: 'mobile_money', country: 'CI' } }])
    })

    it('makes a buyer of a new email, and reuses the buyer for the same email in any letter case', async () => {
      const email = `kofi.${randomUUID().slice(0, 8)}@example.com`
      const first = (await pay({ buyer: { name: 'Kofi Mensah', email }, product: 'prompt-craft' })).body.data.payment
      const second = (
        await pay({ buyer: { name: 'Kofi M.', email: email.toUpperCase() }, product: 'data-foundations' })
      ).body.data.payment
      expect(second.buyer.id).toBe(first.buyer.id)
      expect(await count('buyers', 'lower(email) = $1', [email])).toBe(1)
      expect(second.buyer.email).toBe(email)
    })

    it('treats the same request sent twice as one payment', async () => {
      const request = order()
      const a = await post('/api/checkout/payments', request)
      const b = await post('/api/checkout/payments', request)
      expect(b.status).toBe(201)
      expect(b.body.data.payment.id).toBe(a.body.data.payment.id)
      expect(await count('payments', 'idempotency_key = $1', [request.idempotencyKey])).toBe(1)
    })

    it('refuses a request id that was used for something else', async () => {
      const request = order()
      await post('/api/checkout/payments', request)
      const reused = await post('/api/checkout/payments', { ...request, method: 'voucher' })
      expect(reused.status).toBe(409)
      expect(reused.body.error.code).toBe('conflict')
    })

    it('answers 404 for an unknown course or seller', async () => {
      expect((await pay({ product: 'nothing' })).status).toBe(404)
      expect((await pay({ merchant: 'nobody' })).status).toBe(404)
    })

    it('refuses a method the country does not offer', async () => {
      const { status, body } = await pay({ country: 'CI', method: 'ussd' })
      expect(status).toBe(400)
      expect(body.error.message).toMatch(/not available in this country/)
    })

    it('refuses a country that does not exist', async () => {
      expect((await pay({ country: 'ZZ' })).status).toBe(400)
    })

    it('refuses a method this seller has switched off', async () => {
      expect((await pay({ country: 'KE', method: 'mobile_money' })).status).toBe(400)
      expect((await pay({ country: 'NG', method: 'ussd' })).status).toBe(400)
      expect((await pay({ country: 'GH', method: 'bank_transfer' })).status).toBe(400)
    })

    it('refuses a method whose corridor is down, and accepts it again when it recovers', async () => {
      await db.query(
        "update public.country_methods set status = 'down' where country_code = 'SN' and method_id = 'mobile_money'",
      )
      expect((await pay({ country: 'SN' })).status).toBe(400)
      await db.query(
        "update public.country_methods set status = 'operational' where country_code = 'SN' and method_id = 'mobile_money'",
      )
      expect((await pay({ country: 'SN' })).status).toBe(201)
    })

    it('says PayPal and card connect later, and creates nothing', async () => {
      const before = { payments: await count('payments'), buyers: await count('buyers') }
      for (const method of ['paypal', 'card']) {
        const { status, body } = await pay({ method })
        expect(status).toBe(503)
        expect(body.error.code).toBe('unavailable')
      }
      expect({ payments: await count('payments'), buyers: await count('buyers') }).toEqual(before)
    })

    it('checks what it is sent, field by field', async () => {
      const badEmail = await pay({ buyer: { name: 'Aminata Diallo', email: 'not-an-email' } })
      expect(badEmail.status).toBe(400)
      expect(badEmail.body.error.details['buyer.email']).toBe('Enter a valid email.')

      const shortName = await pay({ buyer: { name: 'A', email: 'a@example.com' } })
      expect(shortName.body.error.details['buyer.name']).toBe('Enter your name.')

      expect((await pay({ idempotencyKey: 'abc' })).status).toBe(400)
      expect((await pay({ country: 'ci' })).status).toBe(400)
      expect((await post('/api/checkout/payments', { ...order(), product: undefined })).status).toBe(400)
      expect((await call('/api/checkout/payments', { method: 'POST', body: 'nope' })).status).toBe(400)
    })

    it('does not use the buyer country for anything but the methods and the currency', async () => {
      const person = buyer()
      const first = (await pay({ buyer: person, country: 'CI', product: 'prompt-craft' })).body.data.payment
      const second = (await pay({ buyer: person, country: 'NG', method: 'bank_transfer', product: 'data-foundations' }))
        .body.data.payment
      expect(first.status).toBe('processing')
      expect(second.status).toBe('processing')
      expect(second.buyer.id).toBe(first.buyer.id)
    })
  })

  describe('reading a payment', () => {
    it('shows its status', async () => {
      const { body } = await pay()
      const { status, body: read } = await call(`/api/checkout/payments/${body.data.payment.id}`)
      expect(status).toBe(200)
      expect(read.data.payment.status).toBe('processing')
    })

    it('answers 404 for an unknown payment and 400 for a bad id', async () => {
      expect((await call(`/api/checkout/payments/${randomUUID()}`)).status).toBe(404)
      expect((await call('/api/checkout/payments/nope')).status).toBe(400)
    })
  })

  describe('checkout sessions', () => {
    it('starts a visit, follows the country, and links it to the payment', async () => {
      const started = await post('/api/checkout/sessions', { product: 'ai-for-work', country: 'CI' })
      expect(started.status).toBe(201)
      const sessionId = started.body.data.id
      expect(
        await one('select outcome, country_code from public.checkout_sessions where id = $1', [sessionId]),
      ).toEqual({ outcome: 'open', country_code: 'CI' })

      const moved = await patch(`/api/checkout/sessions/${sessionId}`, { country: 'SN' })
      expect(moved.status).toBe(200)
      expect(
        (await one('select country_code from public.checkout_sessions where id = $1', [sessionId])).country_code,
      ).toBe('SN')

      const { body } = await pay({ sessionId, country: 'SN' })
      const row = await one('select buyer_id, payment_id, outcome from public.checkout_sessions where id = $1', [
        sessionId,
      ])
      expect(row).toEqual({ buyer_id: body.data.payment.buyer.id, payment_id: body.data.payment.id, outcome: 'open' })

      await settle(body.data.payment.id, 'approve')
      expect(
        (await one('select outcome, closed_at from public.checkout_sessions where id = $1', [sessionId])).outcome,
      ).toBe('paid')
    })

    it('refuses an unknown country or course', async () => {
      expect((await post('/api/checkout/sessions', { product: 'ai-for-work', country: 'ZZ' })).status).toBe(400)
      expect((await post('/api/checkout/sessions', { product: 'nothing', country: 'CI' })).status).toBe(404)
      const started = await post('/api/checkout/sessions', { product: 'ai-for-work', country: 'CI' })
      expect((await patch(`/api/checkout/sessions/${started.body.data.id}`, { country: 'ZZ' })).status).toBe(400)
    })
  })

  describe('a payment that succeeds', () => {
    it('settles, unlocks the course and tells the buyer and the seller', async () => {
      const created = (
        await pay({ buyer: { name: 'Aminata Diallo', email: `ok.${randomUUID().slice(0, 8)}@example.com` } })
      ).body.data.payment
      const done = await settle(created.id, 'approve')

      expect(done.status).toBe(200)
      expect(done.body.data.payment).toMatchObject({ status: 'succeeded', failureCode: null })
      expect(done.body.data.payment.completedAt).toBeTruthy()

      expect(await count('enrollments', 'buyer_id = $1 and payment_id = $2', [created.buyer.id, created.id])).toBe(1)

      const notes = await db.query(
        'select audience, kind, level, title, body, buyer_id, merchant_id from public.notifications where payment_id = $1 order by audience',
        [created.id],
      )
      expect(notes.map((note) => note.audience)).toEqual(['buyer', 'seller'])
      expect(notes[0]).toMatchObject({
        kind: 'payment.succeeded',
        level: 'success',
        title: "You're in",
        body: 'AI for Work is unlocked. Start learning.',
      })
      expect(notes[0].buyer_id).toBe(created.buyer.id)
      expect(notes[1]).toMatchObject({
        kind: 'sale',
        level: 'success',
        title: 'New sale',
        body: "Aminata D. bought AI for Work. $39.00 from Côte d'Ivoire.",
      })
      expect(notes[1].merchant_id).toBeTruthy()

      const timeline = await db.query(
        'select type, actor, data from public.payment_events where payment_id = $1 order by id',
        [created.id],
      )
      expect(timeline.map((event) => event.type)).toEqual(['created', 'succeeded'])
      expect(timeline[1]).toMatchObject({ actor: 'system', data: { simulated: true, outcome: 'approve' } })
    })

    it('shows up as a course for that buyer', async () => {
      const created = (await pay({ product: 'prompt-craft' })).body.data.payment
      expect((await call(`/api/learners/${created.buyer.id}/courses`)).body.data.courses).toEqual([])

      await settle(created.id, 'approve')
      const { status, body } = await call(`/api/learners/${created.buyer.id}/courses`)
      expect(status).toBe(200)
      expect(body.data.courses).toHaveLength(1)
      expect(body.data.courses[0]).toMatchObject({ slug: 'prompt-craft', title: 'Prompt Craft', lessons: 14 })
    })

    it('sends live signals for the payment and for both messages, with ids only', async () => {
      const created = (await pay()).body.data.payment
      await db.query('delete from realtime.sent')
      await settle(created.id, 'approve')

      const signals = (await db.query('select payload from realtime.sent order by id')).map((row) => row.payload)
      expect(signals.some((s) => s.table === 'payments' && s.status === 'succeeded' && s.id === created.id)).toBe(true)
      expect(
        signals.some((s) => s.table === 'notifications' && s.audience === 'buyer' && s.buyerId === created.buyer.id),
      ).toBe(true)
      expect(signals.some((s) => s.table === 'notifications' && s.audience === 'seller')).toBe(true)
      for (const signal of signals) expect(JSON.stringify(signal)).not.toMatch(/@|Aminata|3900|AI for Work/)
    })

    it('does nothing the second time it is settled', async () => {
      const created = (await pay()).body.data.payment
      await settle(created.id, 'approve')
      const again = await settle(created.id, 'approve')
      expect(again.status).toBe(200)
      expect(again.body.data.payment.status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [created.id])).toBe(1)
      expect(await count('notifications', 'payment_id = $1', [created.id])).toBe(2)
      expect(await count('payment_events', 'payment_id = $1', [created.id])).toBe(2)
    })

    it('settles once even when two answers arrive together', async () => {
      const created = (await pay()).body.data.payment
      await Promise.all([settle(created.id, 'approve'), settle(created.id, 'approve')])
      expect(await count('enrollments', 'payment_id = $1', [created.id])).toBe(1)
      expect(await count('notifications', 'payment_id = $1', [created.id])).toBe(2)
    })

    it('does not let a paid payment fail afterwards', async () => {
      const created = (await pay()).body.data.payment
      await settle(created.id, 'approve')
      const late = await settle(created.id, 'decline')
      expect(late.body.data.payment.status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [created.id])).toBe(1)
    })

    it('refuses to sell the same course twice to the same buyer', async () => {
      const person = buyer()
      const first = (await pay({ buyer: person })).body.data.payment
      await settle(first.id, 'approve')

      const again = await pay({ buyer: person })
      expect(again.status).toBe(409)
      expect(again.body.error.message).toBe('You already own this course.')
      expect((await pay({ buyer: person, product: 'prompt-craft' })).status).toBe(201)
    })
  })

  describe('a payment that fails', () => {
    it('records why, unlocks nothing and tells the buyer how to go on', async () => {
      const created = (await pay()).body.data.payment
      const { status, body } = await settle(created.id, 'decline')

      expect(status).toBe(200)
      expect(body.data.payment).toMatchObject({
        status: 'failed',
        failureCode: 'insufficient_funds',
        failureMessage: 'The balance was too low.',
      })
      expect(await count('enrollments', 'payment_id = $1', [created.id])).toBe(0)
      expect(await count('notifications', "payment_id = $1 and audience = 'seller'", [created.id])).toBe(0)

      const note = await one(
        "select level, title, body from public.notifications where payment_id = $1 and audience = 'buyer'",
        [created.id],
      )
      expect(note).toEqual({
        level: 'danger',
        title: 'Payment did not go through',
        body: 'The balance was too low. Try again or choose another method.',
      })

      const failed = await one("select data from public.payment_events where payment_id = $1 and type = 'failed'", [
        created.id,
      ])
      expect(failed.data).toMatchObject({ code: 'insufficient_funds', outcome: 'decline' })
    })

    it('uses the reason that fits the method and the outcome', async () => {
      const timeout = (await pay()).body.data.payment
      expect((await settle(timeout.id, 'timeout')).body.data.payment.failureCode).toBe('approval_timeout')

      const voucher = (await pay({ method: 'voucher' })).body.data.payment
      expect((await settle(voucher.id, 'decline')).body.data.payment.failureCode).toBe('voucher_expired')

      const bank = (await pay({ country: 'NG', method: 'bank_transfer' })).body.data.payment
      expect((await settle(bank.id, 'timeout')).body.data.payment.failureCode).toBe('transfer_not_received')
    })

    it('lets the buyer try again with a new payment and win', async () => {
      const person = buyer()
      const failed = (await pay({ buyer: person })).body.data.payment
      await settle(failed.id, 'decline')

      const retry = (await pay({ buyer: person })).body.data.payment
      expect(retry.id).not.toBe(failed.id)
      expect((await settle(retry.id, 'approve')).body.data.payment.status).toBe('succeeded')
      expect((await call(`/api/learners/${retry.buyer.id}/courses`)).body.data.courses).toHaveLength(1)
    })
  })

  describe('the simulator', () => {
    it('only knows three outcomes', async () => {
      const created = (await pay()).body.data.payment
      const { status, body } = await settle(created.id, 'maybe')
      expect(status).toBe(400)
      expect(body.error.details.outcome).toBeTruthy()
    })

    it('answers 404 for an unknown payment and 400 for a bad id', async () => {
      expect((await settle(randomUUID(), 'approve')).status).toBe(404)
      expect((await settle('nope', 'approve')).status).toBe(400)
    })

    it('will not touch a payment that is not simulated', async () => {
      const created = (await pay()).body.data.payment
      await db.query("update public.payments set provider = 'paypal' where id = $1", [created.id])
      const { status, body } = await settle(created.id, 'approve')
      expect(status).toBe(409)
      expect(body.error.message).toMatch(/simulated/)
      expect((await one('select status from public.payments where id = $1', [created.id])).status).toBe('processing')
    })
  })

  describe('learners', () => {
    it('answers an empty list for a buyer with nothing, and 400 for a bad id', async () => {
      expect((await call(`/api/learners/${randomUUID()}/courses`)).body.data.courses).toEqual([])
      expect((await call('/api/learners/nope/courses')).status).toBe(400)
    })
  })

  describe('limits', () => {
    it('slows down a client that hammers the checkout', async () => {
      const fresh = createApp({ env, logger, db })
      let last
      for (let i = 0; i < 62; i++) last = await fresh.request(`/api/checkout/payments/${randomUUID()}`)
      expect(last.status).toBe(429)
    })
  })
})

describe('without a database', () => {
  const bare = createApp({ env, logger, db: null })

  it('says the database is not connected for every buyer endpoint', async () => {
    const calls = [
      bare.request('/api/checkout/payments/' + randomUUID()),
      bare.request('/api/learners/' + randomUUID() + '/courses'),
      bare.request('/api/simulator/payments/' + randomUUID() + '/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'approve' }),
      }),
      bare.request('/api/catalog/products/ai-for-work'),
    ]
    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(503)
      expect((await response.json()).error.code).toBe('unavailable')
    }
  })
})
