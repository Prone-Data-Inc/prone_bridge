/* PayPal end to end on the server: the PayPal order for a payment, the capture, the verified webhook and the seller
   payout. Real routes, an in-memory Postgres with the demo data, and a stand-in for PayPal's client, so nothing touches
   the network. What PayPal's real answers look like is pinned down in integrations/paypal/*.test.js. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { PaypalError } from './integrations/paypal/client.js'
import { createLogger } from './lib/logger.js'

const logger = createLogger({ level: 'silent' })
/* Not a real credential. Built here so the secret scanner has nothing to mistake for one. */
const placeholder = ['not', 'a', 'real', 'key'].join('-')
const env = loadEnv({
  NODE_ENV: 'test',
  APP_URL: 'https://pronebridge.example.com',
  PAYPAL_CLIENT_ID: 'client-id',
  PAYPAL_CLIENT_SECRET: placeholder,
  PAYPAL_WEBHOOK_ID: 'WH-1',
  PAYPAL_PAYOUT_EMAIL: 'seller@example.com',
})

const declined = (...issues) =>
  new PaypalError({
    status: 422,
    name: 'UNPROCESSABLE_ENTITY',
    issues,
    message: 'The requested action could not be performed.',
  })
const offline = () => new PaypalError({ status: 0, name: 'NETWORK_ERROR', message: 'We could not reach PayPal.' })

/* A stand-in for PayPal's client. Each test sets what PayPal answers; the defaults are a happy PayPal. */
function fakePaypal() {
  const orders = new Map()
  let sequence = 0
  const paypal = {
    enabled: true,
    orders,
    clientToken: vi.fn(),
    createOrder: vi.fn(),
    captureOrder: vi.fn(),
    getOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    createPayout: vi.fn(),
    getPayout: vi.fn(),
  }
  paypal.reset = () => {
    orders.clear()
    paypal.clientToken.mockReset().mockResolvedValue({ token: 'browser-token', expiresIn: 900 })
    paypal.createOrder.mockReset().mockImplementation(async (order) => {
      const id = `ORDER${++sequence}`
      orders.set(id, order)
      return { id, status: 'CREATED' }
    })
    paypal.captureOrder.mockReset().mockImplementation(async (orderId) => completed(orderId))
    paypal.getOrder.mockReset()
    paypal.verifyWebhook.mockReset().mockResolvedValue(true)
    paypal.createPayout
      .mockReset()
      .mockImplementation(async () => ({ batchId: `BATCH${++sequence}`, status: 'SUCCESS' }))
    paypal.getPayout.mockReset()
  }
  /* PayPal's answer to a capture of an order we made: the order's own amount and ids, paid by a Visa. */
  const completed = (orderId, over = {}) => {
    const order = orders.get(orderId)
    return {
      orderId,
      orderStatus: 'COMPLETED',
      captureId: `CAP${++sequence}`,
      captureStatus: 'COMPLETED',
      statusReason: null,
      currency: 'USD',
      amountUsdCents: order.amountUsdCents,
      paypalFeeUsdCents: 157,
      customId: order.customId,
      invoiceId: order.invoiceId,
      cardBrand: 'visa',
      cardLast4: '1881',
      liabilityShift: 'POSSIBLE',
      ...over,
    }
  }
  paypal.completed = completed
  return paypal
}

describe('PayPal', () => {
  let db
  let app
  let bare
  const paypal = fakePaypal()

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    app = createApp({ env, logger, db, paypal })
    bare = createApp({ env: loadEnv({ NODE_ENV: 'test' }), logger, db })
  })
  afterAll(() => db.close())

  beforeEach(async () => {
    paypal.reset()
    await db.query('delete from realtime.sent')
  })

  /* Every request comes from its own address, so the rate limits (which this file is not about) never get in the way. */
  let address = 0
  const call = async (target, path, init = {}) => {
    address += 1
    const headers = {
      ...init.headers,
      'x-forwarded-for': `10.${address >> 16}.${(address >> 8) & 255}.${address & 255}`,
    }
    const response = await target.request(path, { ...init, headers })
    return { status: response.status, body: await response.json() }
  }
  const post = (path, body, target = app) =>
    call(target, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const one = async (sql, params) => (await db.query(sql, params))[0]
  const count = async (table, where = 'true', params = []) =>
    (await one(`select count(*)::int as n from public.${table} where ${where}`, params)).n

  let n = 0
  const buyer = () => ({ name: 'Aminata Diallo', email: `aminata.${++n}.${randomUUID().slice(0, 8)}@example.com` })
  const order = (over = {}) => ({
    idempotencyKey: randomUUID(),
    product: 'ai-for-work',
    country: 'CI',
    method: 'card',
    buyer: buyer(),
    ...over,
  })
  /* Starts a PayPal payment, as the checkout does when the buyer presses PayPal or Pay. */
  const start = async (over) => {
    const { status, body } = await post('/api/checkout/payments', order(over))
    expect(status).toBe(201)
    return { payment: body.data.payment, orderId: body.data.paypal.orderId }
  }
  const capture = (paymentId, orderId, extra = {}) =>
    post(`/api/checkout/payments/${paymentId}/capture`, { orderId, ...extra })
  const row = (id) => one('select * from public.payments where id = $1', [id])
  const events = async (id) =>
    await db.query('select type, actor, data from public.payment_events where payment_id = $1 order by id', [id])
  const notes = (paymentId) =>
    db.query(
      'select audience, kind, level, title from public.notifications where payment_id = $1 order by created_at, audience',
      [paymentId],
    )

  describe('status and client token', () => {
    it('says PayPal is connected, and gives the browser a short lived token pinned to the site', async () => {
      expect((await call(app, '/api/paypal/status')).body.data).toEqual({ available: true, environment: 'sandbox' })
      const { status, body } = await post('/api/paypal/client-token', {})
      expect(status).toBe(200)
      expect(body.data).toEqual({ clientToken: 'browser-token', expiresIn: 900, environment: 'sandbox' })
      expect(paypal.clientToken).toHaveBeenCalledWith({ domain: 'pronebridge.example.com' })
    })

    it('says PayPal is not connected when there are no keys, and hands out no token', async () => {
      expect((await call(bare, '/api/paypal/status')).body.data.available).toBe(false)
      const { status, body } = await post('/api/paypal/client-token', {}, bare)
      expect(status).toBe(503)
      expect(body.error.code).toBe('unavailable')
    })

    it('answers 503, with no details, when PayPal cannot give a token', async () => {
      paypal.clientToken.mockRejectedValue(offline())
      const { status, body } = await post('/api/paypal/client-token', {})
      expect(status).toBe(503)
      expect(JSON.stringify(body)).not.toMatch(/NETWORK_ERROR|client-secret/)
    })
  })

  describe('starting a payment', () => {
    it('prices a card payment in US dollars from the database and makes the PayPal order', async () => {
      const { status, body } = await post('/api/checkout/payments', {
        ...order(),
        amount: 1,
        amountUsdCents: 1,
        displayAmountMinor: 1,
      })
      expect(status).toBe(201)
      const { payment, paypal: made } = body.data
      expect(payment).toMatchObject({
        status: 'requires_payment',
        provider: 'paypal',
        simulated: false,
        amountUsdCents: 3900,
        displayCurrency: 'USD',
        displayAmountMinor: 3900,
        fxRate: 1,
        method: { id: 'card' },
        card: null,
      })
      expect(made.orderId).toMatch(/^ORDER\d+$/)
      expect(paypal.createOrder).toHaveBeenCalledTimes(1)
      expect(paypal.createOrder).toHaveBeenCalledWith({
        amountUsdCents: 3900,
        referenceId: payment.reference,
        customId: payment.id,
        invoiceId: payment.reference,
        description: 'AI for Work',
        requestId: `pb-order-${payment.reference}`,
      })
      expect((await row(payment.id)).provider_order_id).toBe(made.orderId)
      expect((await events(payment.id)).map((event) => event.type)).toEqual(['created', 'order_created'])
    })

    it('works the same for the PayPal button', async () => {
      const { payment } = await start({ method: 'paypal' })
      expect(payment).toMatchObject({ provider: 'paypal', method: { id: 'paypal' }, displayCurrency: 'USD' })
    })

    it('takes the ProneBridge fee from the method, like any other payment', async () => {
      const { payment } = await start()
      const method = await one("select fee_bps, fee_fixed_cents from public.payment_methods where id = 'card'")
      const stored = await row(payment.id)
      expect(stored.fee_usd_cents).toBe(Math.round((3900 * method.fee_bps) / 10_000) + method.fee_fixed_cents)
    })

    it('gives the same order back for the same request, and makes only one', async () => {
      const body = order()
      const first = (await post('/api/checkout/payments', body)).body.data
      const again = (await post('/api/checkout/payments', body)).body.data
      expect(again.payment.id).toBe(first.payment.id)
      expect(again.paypal.orderId).toBe(first.paypal.orderId)
      expect(paypal.createOrder).toHaveBeenCalledTimes(1)
    })

    it('leaves nothing behind when PayPal cannot make the order, and works on the next try', async () => {
      paypal.createOrder.mockRejectedValueOnce(offline())
      const body = order()
      const before = await count('payments')
      const failed = await post('/api/checkout/payments', body)
      expect(failed.status).toBe(503)
      expect(failed.body.error.code).toBe('unavailable')
      expect(await count('payments')).toBe(before)

      const retry = await post('/api/checkout/payments', body)
      expect(retry.status).toBe(201)
      expect(retry.body.data.paypal.orderId).toBeTruthy()
    })

    it('says 502 when PayPal refuses the order, and leaves nothing behind', async () => {
      paypal.createOrder.mockRejectedValueOnce(declined('DUPLICATE_INVOICE_ID'))
      const before = await count('payments')
      const { status, body } = await post('/api/checkout/payments', order())
      expect(status).toBe(502)
      expect(body.error.code).toBe('bad_gateway')
      expect(await count('payments')).toBe(before)
    })

    it('is unavailable, and creates nothing, while PayPal is not connected', async () => {
      const before = { payments: await count('payments'), buyers: await count('buyers') }
      const { status } = await post('/api/checkout/payments', order(), bare)
      expect(status).toBe(503)
      expect({ payments: await count('payments'), buyers: await count('buyers') }).toEqual(before)
    })

    it('does not make a PayPal order for a local method', async () => {
      const { status, body } = await post('/api/checkout/payments', order({ method: 'mobile_money' }))
      expect(status).toBe(201)
      expect(body.data.paypal).toBeUndefined()
      expect(body.data.payment.status).toBe('processing')
      expect(paypal.createOrder).not.toHaveBeenCalled()
    })

    it('does not offer card in a country where it is off', async () => {
      await db.query(
        "update public.country_methods set enabled = false where country_code = 'CI' and method_id = 'card'",
      )
      const { status } = await post('/api/checkout/payments', order())
      expect(status).toBe(400)
      await db.query(
        "update public.country_methods set enabled = true where country_code = 'CI' and method_id = 'card'",
      )
    })
  })

  describe('capturing', () => {
    it('takes the money, then pays the seller, unlocks the course and tells both sides', async () => {
      const { payment, orderId } = await start()
      const { status, body } = await capture(payment.id, orderId)

      expect(status).toBe(200)
      expect(body.data.payment).toMatchObject({
        id: payment.id,
        status: 'succeeded',
        card: { brand: 'visa', last4: '1881' },
        failureCode: null,
      })
      expect(body.data.payment.completedAt).toBeTruthy()
      expect(paypal.captureOrder).toHaveBeenCalledWith(orderId, {
        requestId: `pb-capture-${payment.reference}`,
        mock: undefined,
      })

      const stored = await row(payment.id)
      expect(stored).toMatchObject({
        status: 'succeeded',
        provider_capture_id: expect.stringMatching(/^CAP/),
        card_brand: 'visa',
        card_last4: '1881',
      })
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
      expect((await notes(payment.id)).map((note) => `${note.audience}:${note.kind}`)).toEqual([
        'buyer:payment.succeeded',
        'seller:sale',
      ])
      const succeeded = (await events(payment.id)).find((event) => event.type === 'succeeded')
      expect(succeeded).toMatchObject({
        actor: 'paypal',
        data: { orderId, paypalFeeUsdCents: 157, liabilityShift: 'POSSIBLE' },
      })
    })

    it('never hands PayPal ids or the seller fee to the browser', async () => {
      const { payment, orderId } = await start()
      const text = JSON.stringify((await capture(payment.id, orderId)).body)
      expect(text).not.toMatch(/CAP\d+|providerCaptureId|providerOrderId|feeUsdCents|paypalFee/)
    })

    it('is safe to repeat: a second capture changes nothing and does not ask PayPal again', async () => {
      const { payment, orderId } = await start()
      await capture(payment.id, orderId)
      const again = await capture(payment.id, orderId)
      expect(again.status).toBe(200)
      expect(again.body.data.payment.status).toBe('succeeded')
      expect(paypal.captureOrder).toHaveBeenCalledTimes(1)
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
      expect(await count('notifications', "payment_id = $1 and audience = 'seller'", [payment.id])).toBe(1)
    })

    it('refuses an order that belongs to another payment, and never asks PayPal', async () => {
      const first = await start()
      const second = await start()
      const { status, body } = await capture(first.payment.id, second.orderId)
      expect(status).toBe(400)
      expect(body.error.message).toMatch(/does not belong/)
      expect(paypal.captureOrder).not.toHaveBeenCalled()
      expect((await row(first.payment.id)).status).toBe('requires_payment')
    })

    it("refuses an order id that is not shaped like PayPal's", async () => {
      const { payment } = await start()
      for (const orderId of ['', 'lowercase', '../x', 'A'.repeat(37)]) {
        expect((await capture(payment.id, orderId)).status).toBe(400)
      }
    })

    it('answers 404 for a payment that is not a PayPal payment', async () => {
      const simulated = (await post('/api/checkout/payments', order({ method: 'mobile_money' }))).body.data.payment
      expect((await capture(simulated.id, 'ORDER1')).status).toBe(404)
      expect((await capture(randomUUID(), 'ORDER1')).status).toBe(404)
    })

    it('fails the payment, with the reason, when the card is declined', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValue(declined('INSTRUMENT_DECLINED'))
      const { status, body } = await capture(payment.id, orderId)
      expect(status).toBe(200)
      expect(body.data.payment).toMatchObject({
        status: 'failed',
        failureCode: 'card_declined',
        failureMessage: 'The card was declined.',
      })
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
      expect((await notes(payment.id)).map((note) => note.kind)).toEqual(['payment.failed'])
    })

    it('says PayPal could not take the payment when a PayPal account is refused', async () => {
      const { payment, orderId } = await start({ method: 'paypal' })
      paypal.captureOrder.mockRejectedValue(declined('PAYER_CANNOT_PAY'))
      expect((await capture(payment.id, orderId)).body.data.payment).toMatchObject({
        status: 'failed',
        failureCode: 'paypal_declined',
        failureMessage: 'PayPal could not take that payment.',
      })
    })

    it('fails the payment when the capture itself comes back declined', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockImplementation(async (id) =>
        paypal.completed(id, { captureStatus: 'DECLINED', statusReason: 'DO_NOT_HONOR' }),
      )
      const { body } = await capture(payment.id, orderId)
      expect(body.data.payment).toMatchObject({ status: 'failed', failureCode: 'card_declined' })
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
    })

    it('fails the payment when the card cannot be verified', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValue(declined('AUTHENTICATION_FAILURE'))
      expect((await capture(payment.id, orderId)).body.data.payment).toMatchObject({
        status: 'failed',
        failureCode: 'authentication_failed',
      })
    })

    it('asks the sandbox to refuse the payment when the demo control says decline', async () => {
      const { payment, orderId } = await start()
      await capture(payment.id, orderId, { outcome: 'decline' })
      expect(paypal.captureOrder).toHaveBeenCalledWith(
        orderId,
        expect.objectContaining({ mock: 'INSTRUMENT_DECLINED' }),
      )
      expect((await capture(payment.id, orderId, { outcome: 'maybe' })).status).toBe(400)
    })

    it('keeps a pending capture open, and the webhook finishes it later', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockImplementation(async (id) =>
        paypal.completed(id, { captureStatus: 'PENDING', statusReason: 'ECHECK' }),
      )
      const { body } = await capture(payment.id, orderId)
      expect(body.data.payment.status).toBe('processing')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
      expect((await events(payment.id)).map((event) => event.type)).toContain('capture_pending')

      const { status } = await webhook(captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId))
      expect(status).toBe(200)
      expect((await row(payment.id)).status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
    })

    it('does not settle when the amount PayPal took is not the amount of the order', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockImplementation(async (id) => paypal.completed(id, { amountUsdCents: 100 }))
      const { status } = await capture(payment.id, orderId)
      expect(status).toBe(409)
      expect((await row(payment.id)).status).toBe('requires_payment')
      expect((await events(payment.id)).map((event) => event.type)).toContain('amount_mismatch')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
    })

    it('does not settle when the capture names another payment', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockImplementation(async (id) => paypal.completed(id, { customId: randomUUID() }))
      expect((await capture(payment.id, orderId)).status).toBe(409)
      expect((await row(payment.id)).status).toBe('requires_payment')
    })

    it('says the payment was not approved yet, and leaves it open', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValue(declined('ORDER_NOT_APPROVED'))
      const { status, body } = await capture(payment.id, orderId)
      expect(status).toBe(409)
      expect(body.error.message).toMatch(/not approved/)
      expect((await row(payment.id)).status).toBe('requires_payment')
    })

    it('stays open and says 503 when PayPal cannot be reached, and a retry finishes the job', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValueOnce(offline())
      const first = await capture(payment.id, orderId)
      expect(first.status).toBe(503)
      expect((await row(payment.id)).status).toBe('requires_payment')

      const retry = await capture(payment.id, orderId)
      expect(retry.body.data.payment.status).toBe('succeeded')
      const requestIds = paypal.captureOrder.mock.calls.map(([, options]) => options.requestId)
      expect(new Set(requestIds).size).toBe(1)
    })

    it('reads the order when PayPal says it was already captured, and settles from that', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValue(declined('ORDER_ALREADY_CAPTURED'))
      paypal.getOrder.mockImplementation(async (id) => paypal.completed(id))
      const { body } = await capture(payment.id, orderId)
      expect(body.data.payment.status).toBe('succeeded')
      expect(paypal.getOrder).toHaveBeenCalledWith(orderId)
    })

    it('says 502 for an error it does not know, and leaves the payment open', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockRejectedValue(declined('SOMETHING_NEW'))
      const { status, body } = await capture(payment.id, orderId)
      expect(status).toBe(502)
      expect(body.error.code).toBe('bad_gateway')
      expect((await row(payment.id)).status).toBe('requires_payment')
    })
  })

  describe('cancelling', () => {
    it('ends a payment the buyer walked away from, without a message about it', async () => {
      const { payment } = await start()
      const { status, body } = await post(`/api/checkout/payments/${payment.id}/cancel`, {})
      expect(status).toBe(200)
      expect(body.data.payment).toMatchObject({ status: 'failed', failureCode: 'payer_cancelled' })
      expect(await count('notifications', 'payment_id = $1', [payment.id])).toBe(0)
    })

    it('does not undo a payment that already went through', async () => {
      const { payment, orderId } = await start()
      await capture(payment.id, orderId)
      const { body } = await post(`/api/checkout/payments/${payment.id}/cancel`, {})
      expect(body.data.payment.status).toBe('succeeded')
    })

    it('does not cancel a payment PayPal has already captured, even while it is pending', async () => {
      const { payment, orderId } = await start()
      paypal.captureOrder.mockImplementation(async (id) => paypal.completed(id, { captureStatus: 'PENDING' }))
      await capture(payment.id, orderId)
      const { body } = await post(`/api/checkout/payments/${payment.id}/cancel`, {})
      expect(body.data.payment.status).toBe('processing')
    })
  })

  /* PayPal's webhooks. paypal.verifyWebhook stands in for PayPal's own signature check. */
  const headers = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': 'tid-1',
    'paypal-transmission-sig': 'sig-1',
    'paypal-transmission-time': '2026-11-04T10:00:00Z',
  }
  const webhook = (event, { raw } = {}) =>
    call(app, '/api/webhooks/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: raw ?? JSON.stringify(event),
    })
  const captureEvent = (type, payment, orderId, over = {}) => ({
    id: `WH-${randomUUID()}`,
    event_type: type,
    resource_type: 'capture',
    resource: {
      id: `CAPW${++n}`,
      status: type.endsWith('COMPLETED') ? 'COMPLETED' : type.endsWith('PENDING') ? 'PENDING' : 'DECLINED',
      amount: { currency_code: 'USD', value: '39.00' },
      custom_id: payment.id,
      invoice_id: payment.reference,
      supplementary_data: { related_ids: { order_id: orderId } },
      ...over,
    },
  })
  const inbox = (id) => one('select status, attempts, error from public.webhook_events where id = $1', [id])

  describe('webhooks', () => {
    it('settles a payment from a verified PAYMENT.CAPTURE.COMPLETED, even if the browser never came back', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId)
      const { status, body } = await webhook(event)

      expect(status).toBe(200)
      expect(body.data).toEqual({ received: true, result: 'settled' })
      expect((await row(payment.id)).status).toBe('succeeded')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
      expect((await events(payment.id)).find((entry) => entry.type === 'succeeded').actor).toBe('paypal')
      expect(await inbox(event.id)).toMatchObject({ status: 'processed', attempts: 1 })
    })

    it('asks PayPal to verify the signature with the headers and the event it was sent', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId)
      await webhook(event)
      expect(paypal.verifyWebhook).toHaveBeenCalledTimes(1)
      const [{ header, event: sent }] = paypal.verifyWebhook.mock.calls[0]
      expect(sent).toEqual(event)
      expect(header('paypal-transmission-id')).toBe('tid-1')
      expect(header('paypal-transmission-sig')).toBe('sig-1')
      expect(header('paypal-cert-url')).toMatch(/^https:\/\/api\.sandbox\.paypal\.com\//)
      expect(header('paypal-missing')).toBe('')
    })

    it('rejects an event PayPal does not stand behind, and changes nothing', async () => {
      paypal.verifyWebhook.mockResolvedValue(false)
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId)
      const { status, body } = await webhook(event)
      expect(status).toBe(400)
      expect(body.error.message).toMatch(/signature/)
      expect((await row(payment.id)).status).toBe('requires_payment')
      expect(await inbox(event.id)).toBeUndefined()
    })

    it('does nothing the second time PayPal delivers the same event', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId)
      await webhook(event)
      const again = await webhook(event)
      expect(again.status).toBe(200)
      expect(again.body.data).toEqual({ received: true, duplicate: true })
      expect(await count('notifications', "payment_id = $1 and audience = 'seller'", [payment.id])).toBe(1)
      expect(await inbox(event.id)).toMatchObject({ status: 'processed', attempts: 2 })
    })

    it('finds the payment by its order when the capture carries no custom id', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId, { custom_id: undefined })
      expect((await webhook(event)).body.data.result).toBe('settled')
      expect((await row(payment.id)).status).toBe('succeeded')
    })

    it('is a no-op when the capture answer got there first', async () => {
      const { payment, orderId } = await start()
      await capture(payment.id, orderId)
      const { body } = await webhook(captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId))
      expect(body.data.result).toBe('settled')
      expect(await count('notifications', "payment_id = $1 and audience = 'seller'", [payment.id])).toBe(1)
    })

    it('fails the payment on PAYMENT.CAPTURE.DECLINED and on PAYMENT.CAPTURE.DENIED', async () => {
      for (const type of ['PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.DENIED']) {
        const { payment, orderId } = await start()
        await webhook(captureEvent(type, payment, orderId))
        expect(await row(payment.id)).toMatchObject({ status: 'failed', failure_code: 'card_declined' })
      }
    })

    it('does not trust the amount in an event: a mismatch is recorded and refused, not retried', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId, {
        amount: { currency_code: 'USD', value: '1.00' },
      })
      const { status, body } = await webhook(event)
      expect(status).toBe(200)
      expect(body.data.result).toBe('rejected')
      expect((await row(payment.id)).status).toBe('requires_payment')
      expect(await inbox(event.id)).toMatchObject({ status: 'failed' })
    })

    it('refunds: gives the money back, ends access and tells both sides', async () => {
      const { payment, orderId } = await start()
      await capture(payment.id, orderId)
      const captureId = (await row(payment.id)).provider_capture_id
      const refund = {
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource_type: 'refund',
        resource: {
          id: 'REFUND1',
          status: 'COMPLETED',
          links: [{ rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
        },
      }
      const { body } = await webhook(refund)
      expect(body.data.result).toBe('refunded')
      expect((await row(payment.id)).status).toBe('refunded')
      expect(await count('enrollments', 'payment_id = $1', [payment.id])).toBe(0)
      expect((await notes(payment.id)).map((note) => `${note.audience}:${note.kind}`)).toEqual([
        'buyer:payment.succeeded',
        'seller:sale',
        'buyer:payment.refunded',
        'seller:refund',
      ])
      expect((await events(payment.id)).map((event) => event.type)).toContain('refunded')
    })

    it('ignores a refund of a payment that was never paid', async () => {
      const { payment, orderId } = await start()
      const { body } = await webhook({
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.CAPTURE.REVERSED',
        resource: { id: 'X', custom_id: payment.id, supplementary_data: { related_ids: { order_id: orderId } } },
      })
      expect(body.data.result).toBe('refunded')
      expect((await row(payment.id)).status).toBe('requires_payment')
    })

    it('answers 200 for a payment it does not know, so PayPal does not keep retrying', async () => {
      const event = {
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAPX', status: 'COMPLETED', custom_id: randomUUID() },
      }
      const { status, body } = await webhook(event)
      expect(status).toBe(200)
      expect(body.data.result).toBe('unknown payment')
    })

    it('keeps an event it does not use in the inbox, as ignored', async () => {
      const event = { id: `WH-${randomUUID()}`, event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }
      expect((await webhook(event)).body.data.result).toBe('ignored')
      expect(await inbox(event.id)).toMatchObject({ status: 'ignored' })
    })

    it('refuses text that is not an event', async () => {
      expect((await webhook(null, { raw: 'not json' })).status).toBe(400)
      expect((await webhook(null, { raw: '{"hello":1}' })).status).toBe(400)
      expect((await webhook(null, { raw: '[]' })).status).toBe(400)
      expect(paypal.verifyWebhook).not.toHaveBeenCalled()
    })

    it('answers 503, so PayPal tries again, when PayPal cannot be asked to verify', async () => {
      paypal.verifyWebhook.mockRejectedValue(offline())
      const { payment, orderId } = await start()
      const { status } = await webhook(captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId))
      expect(status).toBe(503)
      expect((await row(payment.id)).status).toBe('requires_payment')
    })

    it('answers 503 when the webhook has not been set up', async () => {
      paypal.verifyWebhook.mockRejectedValue(new PaypalError({ status: 0, name: 'NOT_CONFIGURED' }))
      const { status, body } = await webhook({ id: 'WH-X', event_type: 'PAYMENT.CAPTURE.COMPLETED' })
      expect(status).toBe(503)
      expect(body.error.message).toMatch(/not set up/)
    })

    it('answers 500, and keeps the event as failed, when something unexpected goes wrong', async () => {
      const { payment, orderId } = await start()
      const event = captureEvent('PAYMENT.CAPTURE.COMPLETED', payment, orderId)
      await db.query('alter table public.enrollments rename to enrollments_away')
      try {
        expect((await webhook(event)).status).toBe(500)
      } finally {
        await db.query('alter table public.enrollments_away rename to enrollments')
      }
      expect(await inbox(event.id)).toMatchObject({ status: 'failed' })
      expect((await row(payment.id)).status).toBe('requires_payment')

      /* PayPal sends it again, and this time it works. */
      const retry = await webhook(event)
      expect(retry.status).toBe(200)
      expect((await row(payment.id)).status).toBe('succeeded')
      expect(await inbox(event.id)).toMatchObject({ status: 'processed', attempts: 2 })
    })
  })

  describe('payouts', () => {
    /* What the PayPal payout should add up to: the genuine PayPal sales no payout covers yet, net of the fee. */
    const owedForReal = async () =>
      one(
        `select count(*)::int as n, coalesce(sum(net_usd_cents), 0)::int as net from public.payments
          where provider = 'paypal' and origin = 'app' and status = 'succeeded' and payout_id is null`,
      )
    const sell = async (over) => {
      const { payment, orderId } = await start(over)
      await capture(payment.id, orderId)
      return payment
    }
    const run = (target = app) => post('/api/payouts/run', { merchant: 'pdl' }, target)
    const realOf = (body) => body.data.payouts.find((payout) => !payout.simulated)

    it('pays the genuine PayPal sales to the seller in one batch, and never twice', async () => {
      await sell()
      await sell({ product: 'sql-that-works' })
      const owed = await owedForReal()
      expect(owed.n).toBeGreaterThanOrEqual(2)

      const { status, body } = await run()
      expect(status).toBe(201)
      const real = realOf(body)
      expect(real).toMatchObject({
        provider: 'paypal',
        simulated: false,
        status: 'paid',
        amountUsdCents: owed.net,
        paymentsCount: owed.n,
        recipientEmail: 'seller@example.com',
      })
      expect(real.reference).toMatch(/^po_[A-HJKMNP-TV-Z2-9]{12}$/)

      expect(paypal.createPayout).toHaveBeenCalledTimes(1)
      expect(paypal.createPayout).toHaveBeenCalledWith({
        batchId: real.reference,
        subject: 'Your ProneBridge payout',
        items: [
          {
            itemId: `${real.reference}-1`,
            receiver: 'seller@example.com',
            amountUsdCents: owed.net,
            note: `ProneBridge payout ${real.reference}`,
          },
        ],
      })
      expect(await owedForReal()).toEqual({ n: 0, net: 0 })
      const stored = await one(
        'select status, paypal_batch_id, paypal_item_id, paid_at, origin from public.payouts where id = $1',
        [real.id],
      )
      expect(stored).toMatchObject({
        status: 'paid',
        paypal_batch_id: expect.stringMatching(/^BATCH/),
        paypal_item_id: `${real.reference}-1`,
        origin: 'app',
      })
      expect(stored.paid_at).toBeTruthy()

      const again = await run()
      expect(realOf(again.body)).toBeUndefined()
      expect(paypal.createPayout).toHaveBeenCalledTimes(1)
    })

    it('pays everything else in simulation only, and labels it so', async () => {
      await sell()
      const unpaidSimulated = (
        await one(
          `select count(*)::int as n from public.payments p join public.merchants m on m.id = p.merchant_id
            where m.slug = 'pdl' and p.status = 'succeeded' and p.payout_id is null
              and not (p.provider = 'paypal' and p.origin = 'app')`,
        )
      ).n
      const { body } = await run()
      const simulated = body.data.payouts.find((payout) => payout.simulated)
      if (unpaidSimulated > 0) {
        expect(simulated).toMatchObject({
          provider: 'simulated',
          simulated: true,
          status: 'paid',
          paymentsCount: unpaidSimulated,
        })
        expect(simulated.recipientEmail).toBe('payouts@pdl.example')
      }
      /* the demo history never reaches PayPal: only the one real item was sent */
      const sent = paypal.createPayout.mock.calls.flatMap(([payout]) => payout.items)
      expect(sent.every((item) => item.receiver === 'seller@example.com')).toBe(true)
      expect(
        await one(
          `select count(*)::int as n from public.payments p join public.merchants m on m.id = p.merchant_id
            where m.slug = 'pdl' and p.status = 'succeeded' and p.origin = 'seed' and p.payout_id is null`,
        ),
      ).toEqual({ n: 0 })
    })

    it('tells the seller when a payout is sent', async () => {
      await sell()
      const before = await count('notifications', "audience = 'seller' and kind = 'payout'")
      await run()
      expect(await count('notifications', "audience = 'seller' and kind = 'payout'")).toBeGreaterThan(before)
    })

    it('keeps a pending payout open, then marks it paid when PayPal says so, once', async () => {
      await sell()
      paypal.createPayout.mockImplementation(async () => ({ batchId: 'BATCH-PENDING', status: 'PENDING' }))
      const real = realOf((await run()).body)
      expect(real.status).toBe('processing')
      const started = await count('notifications', "kind = 'payout' and title = 'Payout started'")

      paypal.getPayout.mockResolvedValue({
        batchId: 'BATCH-PENDING',
        status: 'SUCCESS',
        items: [{ itemId: `${real.reference}-1`, status: 'SUCCESS', error: null }],
      })
      const refreshed = await post(`/api/payouts/${real.id}/refresh`, {})
      expect(refreshed.body.data.payout).toMatchObject({ status: 'paid' })
      expect(refreshed.body.data.payout.paidAt).toBeTruthy()
      await post(`/api/payouts/${real.id}/refresh`, {})
      expect(await count('notifications', "kind = 'payout' and title = 'Payout started'")).toBe(started)
      expect(paypal.getPayout).toHaveBeenCalledWith('BATCH-PENDING')
    })

    it('checks payouts that are still open on the next run', async () => {
      await sell()
      paypal.createPayout.mockImplementation(async () => ({ batchId: 'BATCH-OPEN', status: 'PROCESSING' }))
      const real = realOf((await run()).body)
      paypal.getPayout.mockResolvedValue({
        batchId: 'BATCH-OPEN',
        status: 'SUCCESS',
        items: [{ itemId: `${real.reference}-1`, status: 'SUCCESS' }],
      })
      const next = await run()
      expect(next.body.data.payouts.find((payout) => payout.id === real.id)).toMatchObject({ status: 'paid' })
    })

    it('marks a payout failed, and gives its sales back, when PayPal refuses it', async () => {
      await sell()
      const owed = await owedForReal()
      paypal.createPayout.mockRejectedValueOnce(declined('INSUFFICIENT_FUNDS'))
      const real = realOf((await run()).body)
      expect(real).toMatchObject({ status: 'failed', failureCode: 'INSUFFICIENT_FUNDS' })
      expect(await owedForReal()).toEqual(owed)
      expect(await count('notifications', "audience = 'seller' and kind = 'payout.failed'")).toBeGreaterThan(0)

      /* The next run pays those sales again, as a new payout. */
      const next = realOf((await run()).body)
      expect(next).toMatchObject({ status: 'paid', amountUsdCents: owed.net })
      expect(next.reference).not.toBe(real.reference)
    })

    it('keeps a payout that PayPal could not be reached for, and sends the very same one next time', async () => {
      await sell()
      paypal.createPayout.mockRejectedValueOnce(offline())
      const real = realOf((await run()).body)
      expect(real.status).toBe('scheduled')
      expect(
        (await one('select paypal_batch_id from public.payouts where id = $1', [real.id])).paypal_batch_id,
      ).toBeNull()

      const next = await run()
      expect(next.body.data.payouts.find((payout) => payout.id === real.id)).toMatchObject({ status: 'paid' })
      const references = paypal.createPayout.mock.calls.map(([payout]) => payout.batchId)
      expect(references).toEqual([real.reference, real.reference])
    })

    it('treats a returned item as a failed payout and releases its sales', async () => {
      await sell()
      const real = realOf((await run()).body)
      const event = {
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.PAYOUTS-ITEM.RETURNED',
        resource: {
          payout_batch_id: 'X',
          sender_batch_id: real.reference,
          transaction_status: 'RETURNED',
          payout_item: { sender_item_id: `${real.reference}-1` },
        },
      }
      expect((await webhook(event)).body.data.result).toBe('payout')
      expect((await call(app, `/api/payouts/${real.id}`)).body.data.payout.status).toBe('failed')
      expect((await owedForReal()).n).toBeGreaterThan(0)
    })

    it("follows PayPal's batch webhooks", async () => {
      await sell()
      paypal.createPayout.mockImplementation(async () => ({ batchId: 'BATCH-HOOK', status: 'PENDING' }))
      const real = realOf((await run()).body)
      const event = {
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
        resource: {
          batch_header: {
            payout_batch_id: 'BATCH-HOOK',
            batch_status: 'SUCCESS',
            sender_batch_header: { sender_batch_id: real.reference },
          },
        },
      }
      expect((await webhook(event)).body.data.result).toBe('payout')
      expect((await call(app, `/api/payouts/${real.id}`)).body.data.payout.status).toBe('paid')
    })

    it('does not know a payout it never made', async () => {
      const event = {
        id: `WH-${randomUUID()}`,
        event_type: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
        resource: { batch_header: { payout_batch_id: 'NOPE', batch_status: 'SUCCESS' } },
      }
      expect((await webhook(event)).body.data.result).toBe('unknown payout')
    })

    it('says what is missing instead of paying, when there is no sandbox account to pay', async () => {
      await sell()
      const owed = await owedForReal()
      const noEmail = createApp({
        env: loadEnv({ NODE_ENV: 'test', PAYPAL_CLIENT_ID: 'client-id', PAYPAL_CLIENT_SECRET: placeholder }),
        logger,
        db,
        paypal,
      })
      const { status, body } = await run(noEmail)
      expect(status).toBe(201)
      expect(realOf(body)).toBeUndefined()
      expect(body.data.skipped[0].reason).toMatch(/PAYPAL_PAYOUT_EMAIL/)
      expect(await owedForReal()).toEqual(owed)
      expect(paypal.createPayout).not.toHaveBeenCalled()
    })

    it('says so when PayPal is not connected at all', async () => {
      const { body } = await run(bare)
      expect(body.data.skipped[0].reason).toBe('PayPal is not connected yet.')
    })

    it('answers 404 for a seller or a payout it does not have', async () => {
      expect((await post('/api/payouts/run', { merchant: 'nobody' })).status).toBe(404)
      expect((await call(app, `/api/payouts/${randomUUID()}`)).status).toBe(404)
      expect((await post(`/api/payouts/${randomUUID()}/refresh`, {})).status).toBe(404)
      expect((await call(app, '/api/payouts/not-an-id')).status).toBe(400)
      expect((await post('/api/payouts/run', { merchant: 'Bad Name' })).status).toBe(400)
    })

    it('leaves a simulated payout as it is when asked to refresh it', async () => {
      const { body } = await run()
      const simulated = body.data.payouts.find((payout) => payout.simulated)
      if (!simulated) return
      const refreshed = await post(`/api/payouts/${simulated.id}/refresh`, {})
      expect(refreshed.body.data.payout).toMatchObject({ id: simulated.id, status: 'paid', simulated: true })
    })
  })
})
