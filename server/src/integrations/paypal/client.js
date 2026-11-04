/* The PayPal sandbox, as the rest of the server needs it. This is the only file that talks to PayPal: a token that is
   cached until it nearly expires, then Orders, webhook verification, client tokens for the browser and Payouts.
   Only the sandbox is ever called. The secret stays on the server and is never logged. Every call that creates
   something carries a PayPal-Request-Id, so a retry after a dropped connection is the same request, not a second one.
   fetch is injected, so tests run without the network. */
import { dollars, readCapture, readPayout } from './mappers.js'

const API = 'https://api-m.sandbox.paypal.com'
const TIMEOUT_MS = 15_000
const TOKEN_MARGIN_MS = 60_000

/* An error PayPal answered with (status, name, the issue codes in details) or a failure to reach it (status 0). */
export class PaypalError extends Error {
  constructor({ status = 0, name = 'PAYPAL_ERROR', issues = [], message = 'PayPal did not answer.', debugId = null }) {
    super(message)
    this.name = 'PaypalError'
    this.status = status
    this.code = name
    this.issues = issues
    this.debugId = debugId
  }

  has(issue) {
    return this.issues.includes(issue)
  }

  get unreachable() {
    return this.status === 0 || this.status >= 500
  }
}

const failure = (status, body) =>
  new PaypalError({
    status,
    name: body?.name ?? body?.error ?? 'PAYPAL_ERROR',
    issues: (body?.details ?? []).map((detail) => detail.issue).filter(Boolean),
    message: body?.message ?? body?.error_description ?? `PayPal answered ${status}.`,
    debugId: body?.debug_id ?? null,
  })

export function createPaypalClient({ config, fetch: fetcher = globalThis.fetch, now = Date.now }) {
  const enabled = Boolean(config.clientId && config.clientSecret)
  const basic = enabled ? Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64') : ''

  let cached = null
  let pending = null

  async function send(url, init) {
    try {
      return await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      throw new PaypalError({
        status: 0,
        name: 'NETWORK_ERROR',
        message: error?.name === 'TimeoutError' ? 'PayPal took too long to answer.' : 'We could not reach PayPal.',
      })
    }
  }

  /* One token request shared by every caller that arrives while it is in flight. */
  async function token(extra = '') {
    const response = await send(`${API}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials${extra}`,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw failure(response.status, body)
    return body
  }

  async function accessToken() {
    if (cached && cached.expiresAt > now()) return cached.value
    pending ??= token()
      .then((body) => {
        cached = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 - TOKEN_MARGIN_MS }
        return cached.value
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  async function call(path, { method = 'GET', body, headers = {}, requestId } = {}, retried = false) {
    if (!enabled) throw new PaypalError({ status: 0, name: 'NOT_CONFIGURED', message: 'PayPal is not connected.' })
    const response = await send(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    /* A token revoked early: get a new one once and try again. */
    if (response.status === 401 && !retried) {
      cached = null
      return call(path, { method, body, headers, requestId }, true)
    }
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw failure(response.status, payload)
    return payload
  }

  /* In the sandbox, a header can make PayPal answer with a chosen error, to test a failed payment. */
  const mockHeader = (code) =>
    code ? { 'PayPal-Mock-Response': JSON.stringify({ mock_application_codes: code }) } : {}

  return {
    enabled,

    /* A short lived token the browser uses to start PayPal's SDK. Never the secret. domain pins it to the site when
       it is a real domain (PayPal refuses localhost). */
    async clientToken({ domain } = {}) {
      if (!enabled) throw new PaypalError({ status: 0, name: 'NOT_CONFIGURED', message: 'PayPal is not connected.' })
      const body = await token(`&response_type=client_token${domain ? `&domains[]=${encodeURIComponent(domain)}` : ''}`)
      return { token: body.access_token, expiresIn: body.expires_in }
    },

    /* The amount comes from the caller, which reads it from the database. The browser never names a price. */
    async createOrder({ amountUsdCents, referenceId, customId, invoiceId, description, requestId, mock }) {
      const order = await call('/v2/checkout/orders', {
        method: 'POST',
        requestId,
        headers: mockHeader(mock),
        body: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: referenceId,
              custom_id: customId,
              invoice_id: invoiceId,
              description,
              amount: { currency_code: 'USD', value: dollars(amountUsdCents) },
            },
          ],
        },
      })
      return { id: order.id, status: order.status }
    },

    /* Takes the money once the buyer has approved. The full answer is asked for, since the default one has no details. */
    async captureOrder(orderId, { requestId, mock } = {}) {
      const order = await call(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        requestId,
        headers: { Prefer: 'return=representation', ...mockHeader(mock) },
      })
      return readCapture(order)
    },

    async getOrder(orderId) {
      return readCapture(await call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`))
    },

    /* PayPal checks the signature of a webhook for us. header is a function: a header name gives its value. */
    async verifyWebhook({ header, event }) {
      if (!config.webhookId)
        throw new PaypalError({ status: 0, name: 'NOT_CONFIGURED', message: 'The webhook is not set up.' })
      const result = await call('/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        body: {
          auth_algo: header('paypal-auth-algo'),
          cert_url: header('paypal-cert-url'),
          transmission_id: header('paypal-transmission-id'),
          transmission_sig: header('paypal-transmission-sig'),
          transmission_time: header('paypal-transmission-time'),
          webhook_id: config.webhookId,
          webhook_event: event,
        },
      })
      return result?.verification_status === 'SUCCESS'
    },

    /* Pays sellers. batchId doubles as PayPal's sender_batch_id: sending the same one again never pays twice. */
    async createPayout({ batchId, subject, items, mock }) {
      const result = await call('/v1/payments/payouts', {
        method: 'POST',
        requestId: batchId,
        headers: mockHeader(mock),
        body: {
          sender_batch_header: { sender_batch_id: batchId, email_subject: subject, recipient_type: 'EMAIL' },
          items: items.map((item) => ({
            recipient_type: 'EMAIL',
            receiver: item.receiver,
            amount: { value: dollars(item.amountUsdCents), currency: 'USD' },
            note: item.note,
            sender_item_id: item.itemId,
          })),
        },
      })
      return {
        batchId: result?.batch_header?.payout_batch_id ?? null,
        status: result?.batch_header?.batch_status ?? null,
      }
    },

    async getPayout(batchId) {
      return readPayout(await call(`/v1/payments/payouts/${encodeURIComponent(batchId)}`))
    },
  }
}
