import { describe, expect, it, vi } from 'vitest'
import { PaypalError, createPaypalClient } from './client.js'

const config = { clientId: 'client-id', clientSecret: 'client-secret', webhookId: 'WH-1' }
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tokenAnswer = (value = 'access-1', expiresIn = 32_400) =>
  json(200, { access_token: value, expires_in: expiresIn })

/* A fake fetch that answers from a list, in order, and remembers what it was asked. */
function fakeFetch(...answers) {
  const calls = []
  const fetch = vi.fn(async (url, init) => {
    calls.push({
      url,
      init,
      body:
        init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body,
    })
    const next = answers.shift()
    if (next instanceof Error) throw next
    return next
  })
  return { fetch, calls }
}

describe('access token', () => {
  it('is asked for once and reused until it nearly expires', async () => {
    let time = 1_000_000
    const { fetch, calls } = fakeFetch(
      tokenAnswer('a', 600),
      json(200, { id: 'O1', status: 'CREATED' }),
      json(200, { id: 'O2', status: 'CREATED' }),
      tokenAnswer('b'),
      json(200, { id: 'O3', status: 'CREATED' }),
    )
    const client = createPaypalClient({ config, fetch, now: () => time })
    const order = {
      amountUsdCents: 100,
      referenceId: 'r',
      customId: 'c',
      invoiceId: 'i',
      description: 'd',
      requestId: 'x',
    }

    await client.createOrder(order)
    await client.createOrder(order)
    expect(calls.filter((call) => call.url.endsWith('/v1/oauth2/token'))).toHaveLength(1)

    time += 600_000 /* past expiry minus the safety margin */
    await client.createOrder(order)
    expect(calls.filter((call) => call.url.endsWith('/v1/oauth2/token'))).toHaveLength(2)
    expect(calls.at(-1).init.headers.Authorization).toBe('Bearer b')
  })

  it('is requested with the app credentials in a Basic header, to the sandbox only', async () => {
    const { fetch, calls } = fakeFetch(tokenAnswer(), json(200, { id: 'O1', status: 'CREATED' }))
    await createPaypalClient({ config, fetch }).createOrder({ amountUsdCents: 100 })
    const token = calls[0]
    expect(token.url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token')
    expect(token.init.headers.Authorization).toBe(`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`)
    expect(token.body).toBe('grant_type=client_credentials')
    expect(calls.every((call) => call.url.startsWith('https://api-m.sandbox.paypal.com/'))).toBe(true)
  })

  it('is shared by calls that arrive together', async () => {
    const { fetch, calls } = fakeFetch(
      tokenAnswer(),
      json(200, { id: 'A', status: 'CREATED' }),
      json(200, { id: 'B', status: 'CREATED' }),
    )
    const client = createPaypalClient({ config, fetch })
    await Promise.all([client.createOrder({ amountUsdCents: 1 }), client.createOrder({ amountUsdCents: 2 })])
    expect(calls.filter((call) => call.url.endsWith('/v1/oauth2/token'))).toHaveLength(1)
  })

  it('is replaced once when PayPal says it is no longer valid', async () => {
    const { fetch, calls } = fakeFetch(
      tokenAnswer('old'),
      json(401, { name: 'AUTHENTICATION_FAILURE', message: 'expired' }),
      tokenAnswer('new'),
      json(201, { id: 'O1', status: 'CREATED' }),
    )
    const result = await createPaypalClient({ config, fetch }).createOrder({ amountUsdCents: 100 })
    expect(result).toEqual({ id: 'O1', status: 'CREATED' })
    expect(calls.at(-1).init.headers.Authorization).toBe('Bearer new')
  })

  it('does not loop when PayPal keeps refusing it', async () => {
    const refusal = () => json(401, { name: 'AUTHENTICATION_FAILURE', message: 'no' })
    const { fetch } = fakeFetch(tokenAnswer('a'), refusal(), tokenAnswer('b'), refusal())
    await expect(createPaypalClient({ config, fetch }).createOrder({ amountUsdCents: 1 })).rejects.toMatchObject({
      status: 401,
    })
  })
})

describe('errors', () => {
  it('turns an answer with details into a PaypalError with its issues', async () => {
    const { fetch } = fakeFetch(
      tokenAnswer(),
      json(422, {
        name: 'UNPROCESSABLE_ENTITY',
        message: 'The requested action could not be performed.',
        debug_id: 'dbg1',
        details: [{ issue: 'INSTRUMENT_DECLINED' }, { issue: 'OTHER' }],
      }),
    )
    const error = await createPaypalClient({ config, fetch })
      .captureOrder('ORDER1')
      .catch((caught) => caught)
    expect(error).toBeInstanceOf(PaypalError)
    expect(error).toMatchObject({
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      issues: ['INSTRUMENT_DECLINED', 'OTHER'],
      debugId: 'dbg1',
    })
    expect(error.has('INSTRUMENT_DECLINED')).toBe(true)
    expect(error.has('NOPE')).toBe(false)
    expect(error.unreachable).toBe(false)
  })

  it('says unreachable for a dropped connection and for PayPal being down', async () => {
    const offline = fakeFetch(tokenAnswer(), new TypeError('network down'))
    const error = await createPaypalClient({ config, fetch: offline.fetch })
      .getOrder('O')
      .catch((caught) => caught)
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
    expect(error.unreachable).toBe(true)

    const down = fakeFetch(tokenAnswer(), json(503, { name: 'SERVICE_UNAVAILABLE', message: 'down' }))
    const second = await createPaypalClient({ config, fetch: down.fetch })
      .getOrder('O')
      .catch((caught) => caught)
    expect(second.unreachable).toBe(true)
  })

  it('says it took too long when the request times out', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const { fetch } = fakeFetch(tokenAnswer(), timeout)
    const error = await createPaypalClient({ config, fetch })
      .getOrder('O')
      .catch((caught) => caught)
    expect(error).toMatchObject({ status: 0, message: 'PayPal took too long to answer.' })
  })

  it('does not call PayPal at all without keys', async () => {
    const { fetch } = fakeFetch()
    const client = createPaypalClient({ config: { clientId: '', clientSecret: '', webhookId: '' }, fetch })
    expect(client.enabled).toBe(false)
    await expect(client.createOrder({ amountUsdCents: 100 })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    await expect(client.clientToken()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never puts the secret or a token in an error message', async () => {
    const { fetch } = fakeFetch(
      json(401, { error: 'invalid_client', error_description: 'Client Authentication failed' }),
    )
    const error = await createPaypalClient({ config, fetch })
      .getOrder('O')
      .catch((caught) => caught)
    expect(error.message).toBe('Client Authentication failed')
    expect(JSON.stringify({ message: error.message, code: error.code, issues: error.issues })).not.toContain(
      'client-secret',
    )
  })
})

describe('orders', () => {
  it('creates an order for the amount it is given, with an idempotency key and the payment ids on it', async () => {
    const { fetch, calls } = fakeFetch(tokenAnswer(), json(201, { id: 'ORDER1', status: 'CREATED', links: [] }))
    const result = await createPaypalClient({ config, fetch }).createOrder({
      amountUsdCents: 3900,
      referenceId: 'pb_REF',
      customId: 'payment-uuid',
      invoiceId: 'pb_REF',
      description: 'AI for Work',
      requestId: 'pb-order-pb_REF',
    })
    expect(result).toEqual({ id: 'ORDER1', status: 'CREATED' })
    const call = calls[1]
    expect(call.url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders')
    expect(call.init.method).toBe('POST')
    expect(call.init.headers['PayPal-Request-Id']).toBe('pb-order-pb_REF')
    expect(call.body).toEqual({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: 'pb_REF',
          custom_id: 'payment-uuid',
          invoice_id: 'pb_REF',
          description: 'AI for Work',
          amount: { currency_code: 'USD', value: '39.00' },
        },
      ],
    })
  })

  it('captures an order and asks for the full answer, then reads it', async () => {
    const { fetch, calls } = fakeFetch(
      tokenAnswer(),
      json(201, {
        id: 'ORDER1',
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [{ id: 'CAP1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '39.00' } }],
            },
          },
        ],
      }),
    )
    const capture = await createPaypalClient({ config, fetch }).captureOrder('ORDER1', {
      requestId: 'pb-capture-pb_REF',
    })
    expect(capture).toMatchObject({
      orderId: 'ORDER1',
      captureId: 'CAP1',
      captureStatus: 'COMPLETED',
      amountUsdCents: 3900,
    })
    expect(calls[1].url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER1/capture')
    expect(calls[1].init.headers.Prefer).toBe('return=representation')
    expect(calls[1].init.headers['PayPal-Request-Id']).toBe('pb-capture-pb_REF')
    expect(calls[1].init.headers['PayPal-Mock-Response']).toBeUndefined()
  })

  it('can ask the sandbox to refuse a payment, to test a failure', async () => {
    const { fetch, calls } = fakeFetch(tokenAnswer(), json(201, { id: 'O' }))
    await createPaypalClient({ config, fetch }).captureOrder('O', { mock: 'INSTRUMENT_DECLINED' })
    expect(JSON.parse(calls[1].init.headers['PayPal-Mock-Response'])).toEqual({
      mock_application_codes: 'INSTRUMENT_DECLINED',
    })
  })

  it('keeps an order id from breaking out of the path', async () => {
    const { fetch, calls } = fakeFetch(tokenAnswer(), json(200, { id: 'O' }))
    await createPaypalClient({ config, fetch }).getOrder('../v1/payments')
    expect(calls[1].url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/..%2Fv1%2Fpayments')
  })
})

describe('client token', () => {
  it('asks PayPal for a browser safe token and gives back only the token and its life', async () => {
    const { fetch, calls } = fakeFetch(
      json(200, { access_token: 'browser-token', expires_in: 900, app_id: 'x', nonce: 'n' }),
    )
    const result = await createPaypalClient({ config, fetch }).clientToken({ domain: 'pronebridge.example.com' })
    expect(result).toEqual({ token: 'browser-token', expiresIn: 900 })
    expect(calls[0].body).toBe(
      'grant_type=client_credentials&response_type=client_token&domains[]=pronebridge.example.com',
    )
  })

  it('leaves the domain out when there is none', async () => {
    const { fetch, calls } = fakeFetch(json(200, { access_token: 't', expires_in: 900 }))
    await createPaypalClient({ config, fetch }).clientToken()
    expect(calls[0].body).toBe('grant_type=client_credentials&response_type=client_token')
  })
})

describe('webhook verification', () => {
  const headers = {
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
    'paypal-transmission-id': 'tid',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': '2026-11-04T10:00:00Z',
  }
  const header = (name) => headers[name] ?? ''
  const event = { id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }

  it('sends PayPal the headers, the webhook id and the event, and reads the verdict', async () => {
    const { fetch, calls } = fakeFetch(tokenAnswer(), json(200, { verification_status: 'SUCCESS' }))
    expect(await createPaypalClient({ config, fetch }).verifyWebhook({ header, event })).toBe(true)
    expect(calls[1].url).toBe('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature')
    expect(calls[1].body).toEqual({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
      transmission_id: 'tid',
      transmission_sig: 'sig',
      transmission_time: '2026-11-04T10:00:00Z',
      webhook_id: 'WH-1',
      webhook_event: event,
    })
  })

  it('says no for anything but SUCCESS', async () => {
    const { fetch } = fakeFetch(tokenAnswer(), json(200, { verification_status: 'FAILURE' }))
    expect(await createPaypalClient({ config, fetch }).verifyWebhook({ header, event })).toBe(false)
  })

  it('cannot verify without a webhook id', async () => {
    const { fetch } = fakeFetch()
    const client = createPaypalClient({ config: { ...config, webhookId: '' }, fetch })
    await expect(client.verifyWebhook({ header, event })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })
})

describe('payouts', () => {
  it('creates a batch with the reference as its id, and reads the batch id and status', async () => {
    const { fetch, calls } = fakeFetch(
      tokenAnswer(),
      json(201, { batch_header: { payout_batch_id: 'PB1', batch_status: 'PENDING' } }),
    )
    const result = await createPaypalClient({ config, fetch }).createPayout({
      batchId: 'po_REF',
      subject: 'Your ProneBridge payout',
      items: [
        { itemId: 'po_REF-1', receiver: 'seller@example.com', amountUsdCents: 7450, note: 'ProneBridge payout po_REF' },
      ],
    })
    expect(result).toEqual({ batchId: 'PB1', status: 'PENDING' })
    expect(calls[1].url).toBe('https://api-m.sandbox.paypal.com/v1/payments/payouts')
    expect(calls[1].init.headers['PayPal-Request-Id']).toBe('po_REF')
    expect(calls[1].body).toEqual({
      sender_batch_header: {
        sender_batch_id: 'po_REF',
        email_subject: 'Your ProneBridge payout',
        recipient_type: 'EMAIL',
      },
      items: [
        {
          recipient_type: 'EMAIL',
          receiver: 'seller@example.com',
          amount: { value: '74.50', currency: 'USD' },
          note: 'ProneBridge payout po_REF',
          sender_item_id: 'po_REF-1',
        },
      ],
    })
  })

  it('reads a batch back', async () => {
    const { fetch, calls } = fakeFetch(
      tokenAnswer(),
      json(200, {
        batch_header: { payout_batch_id: 'PB1', batch_status: 'SUCCESS' },
        items: [{ payout_item_id: 'I1', transaction_status: 'SUCCESS', payout_item: { sender_item_id: 'po_REF-1' } }],
      }),
    )
    const result = await createPaypalClient({ config, fetch }).getPayout('PB1')
    expect(calls[1].url).toBe('https://api-m.sandbox.paypal.com/v1/payments/payouts/PB1')
    expect(result).toMatchObject({ status: 'SUCCESS', items: [{ itemId: 'po_REF-1', status: 'SUCCESS' }] })
  })
})
