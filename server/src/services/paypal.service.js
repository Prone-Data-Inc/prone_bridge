/* Taking money through PayPal: an order is made for a payment, the buyer approves it in PayPal's own window or card
   fields, and the server captures it. Every number comes from the database, never from the browser. What PayPal says
   about the capture goes through the settlement service, the same one PayPal's webhook uses, so the two always agree.
   Two things can arrive in either order (the capture answer and the webhook) and the result is the same. */
import { badGateway, badRequest, conflict, notFound, unavailable } from '#server/lib/errors.js'
import { PaypalError } from '#server/integrations/paypal/client.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { paymentView } from './payment.view.js'

const OPEN = new Set(['requires_payment', 'processing'])

/* Reasons PayPal gives when it refuses to take the money. */
const DECLINES = new Set([
  'INSTRUMENT_DECLINED',
  'TRANSACTION_REFUSED',
  'PAYER_CANNOT_PAY',
  'PAYER_ACCOUNT_RESTRICTED',
  'PAYER_ACCOUNT_LOCKED_OR_CLOSED',
  'CARD_EXPIRED',
])
const AUTHENTICATION = new Set(['AUTHENTICATION_FAILURE', 'PAYER_ACTION_REQUIRED_3DS'])

/* The buyer sees "the card was declined" for a card and "PayPal could not take that payment" for a PayPal account. */
const declineCode = (payment) => (payment.methodId === 'card' ? 'card_declined' : 'paypal_declined')

/* A domain PayPal accepts for pinning a client token: a real host name. localhost and addresses are refused. */
export function pinnableDomain(appUrl) {
  try {
    const host = new URL(appUrl).hostname
    return host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':') ? host : undefined
  } catch {
    return undefined
  }
}

export function createPaypalService({ db, paypal, settlement, env, logger }) {
  const payments = createPaymentRepository({ db })

  /* PayPal's errors, said in our words. The details go to the log, never to the buyer. */
  function explain(error, action) {
    if (!(error instanceof PaypalError)) return error
    logger?.warn('paypal call failed', {
      action,
      status: error.status,
      name: error.code,
      issues: error.issues,
      debugId: error.debugId,
    })
    if (error.code === 'NOT_CONFIGURED') return unavailable('PayPal is not connected yet.')
    if (error.unreachable) return unavailable('We could not reach PayPal. Try again in a moment.')
    return badGateway('PayPal could not complete that. Try again.')
  }

  async function load(paymentId) {
    const payment = await payments.findById(paymentId)
    if (!payment || payment.provider !== 'paypal') throw notFound('We could not find that payment.')
    return payment
  }

  /* What PayPal says happened to the money, applied to the payment. Safe to run twice and from two places. */
  async function applyCapture(payment, capture, actor = 'paypal') {
    if (capture.customId && capture.customId !== payment.id) {
      logger?.error('paypal capture belongs to another payment', {
        paymentId: payment.id,
        captureId: capture.captureId,
      })
      throw conflict('That PayPal payment does not match this order.')
    }
    const wrongAmount =
      capture.amountUsdCents !== null &&
      (capture.amountUsdCents !== payment.amountUsdCents || (capture.currency && capture.currency !== 'USD'))
    if (wrongAmount) {
      await payments.addEvent({
        paymentId: payment.id,
        type: 'amount_mismatch',
        actor: 'paypal',
        data: { captureId: capture.captureId, amountUsdCents: capture.amountUsdCents, currency: capture.currency },
      })
      logger?.error('paypal capture amount does not match', { paymentId: payment.id, captureId: capture.captureId })
      throw conflict('The amount PayPal took does not match this order.')
    }

    const record = { captureId: capture.captureId, cardBrand: capture.cardBrand, cardLast4: capture.cardLast4 }
    switch (capture.captureStatus) {
      case 'COMPLETED':
        return settlement.succeed(payment.id, {
          actor,
          capture: record,
          data: {
            orderId: capture.orderId ?? payment.providerOrderId,
            captureId: capture.captureId,
            paypalFeeUsdCents: capture.paypalFeeUsdCents,
            liabilityShift: capture.liabilityShift,
          },
        })
      case 'DECLINED':
      case 'FAILED':
        return settlement.fail(payment.id, declineCode(payment), {
          actor,
          capture: record,
          data: { captureId: capture.captureId, reason: capture.statusReason },
        })
      case 'PENDING':
        /* PayPal holds the money now, so the capture is recorded: from here the buyer's window cannot cancel it. */
        await payments.recordCapture(payment.id, record)
        await payments.markProcessing(payment.id)
        await payments.addEvent({
          paymentId: payment.id,
          type: 'capture_pending',
          actor: 'paypal',
          data: { captureId: capture.captureId, reason: capture.statusReason },
        })
        return { payment: await payments.findById(payment.id), changed: false }
      default:
        return { payment, changed: false }
    }
  }

  return {
    status: () => ({ available: paypal.enabled, environment: env.paypal.env }),

    /* A short lived key so the browser can start PayPal's SDK. It cannot take or move money. */
    async clientToken() {
      try {
        const { token, expiresIn } = await paypal.clientToken({ domain: pinnableDomain(env.appUrl) })
        return { clientToken: token, expiresIn, environment: env.paypal.env }
      } catch (error) {
        throw explain(error, 'client token')
      }
    },

    /* The PayPal order for a payment. Made once: asking again gives the same order back. */
    async createOrder(paymentId) {
      const payment = await load(paymentId)
      if (payment.providerOrderId) return { orderId: payment.providerOrderId }
      if (!OPEN.has(payment.status)) throw conflict('That payment is already finished.')

      let order
      try {
        order = await paypal.createOrder({
          amountUsdCents: payment.amountUsdCents,
          referenceId: payment.reference,
          customId: payment.id,
          invoiceId: payment.reference,
          description: payment.productTitle.slice(0, 127),
          requestId: `pb-order-${payment.reference}`,
        })
      } catch (error) {
        /* The buyer never got as far as PayPal, so there is nothing to keep. */
        await payments.removeUnstarted(paymentId)
        throw explain(error, 'create order')
      }

      if (!(await payments.setOrder(paymentId, order.id))) return { orderId: (await load(paymentId)).providerOrderId }
      await payments.addEvent({ paymentId, type: 'order_created', actor: 'system', data: { orderId: order.id } })
      return { orderId: order.id }
    },

    /* The buyer approved. Take the money, then settle. outcome 'decline' asks the sandbox to refuse the payment, so a
       failed card can be shown on demand. */
    async capture({ paymentId, orderId, outcome = 'approve' }) {
      const payment = await load(paymentId)
      if (!payment.providerOrderId || payment.providerOrderId !== orderId) {
        throw badRequest('That order does not belong to this payment.')
      }
      if (!OPEN.has(payment.status)) return paymentView(payment)

      let capture
      try {
        capture = await paypal.captureOrder(orderId, {
          requestId: `pb-capture-${payment.reference}`,
          mock: outcome === 'decline' ? 'INSTRUMENT_DECLINED' : undefined,
        })
      } catch (error) {
        if (error instanceof PaypalError) {
          if (error.issues.some((issue) => DECLINES.has(issue))) {
            const done = await settlement.fail(paymentId, declineCode(payment), {
              actor: 'paypal',
              data: { issues: error.issues, debugId: error.debugId },
            })
            return paymentView(done.payment)
          }
          if (error.issues.some((issue) => AUTHENTICATION.has(issue))) {
            const done = await settlement.fail(paymentId, 'authentication_failed', {
              actor: 'paypal',
              data: { issues: error.issues, debugId: error.debugId },
            })
            return paymentView(done.payment)
          }
          /* Taken already (a retry, or the webhook got there first): read what happened instead of asking again. */
          if (error.has('ORDER_ALREADY_CAPTURED')) {
            capture = await paypal.getOrder(orderId).catch((lookup) => {
              throw explain(lookup, 'read order')
            })
          } else if (error.has('ORDER_NOT_APPROVED') || error.has('PAYER_ACTION_REQUIRED')) {
            throw conflict('The payment was not approved yet.')
          } else {
            throw explain(error, 'capture')
          }
        } else {
          throw error
        }
      }

      const done = await applyCapture(payment, capture, 'paypal')
      return paymentView(done.payment)
    },

    /* The buyer closed PayPal's window or the card check. Nothing was taken, so the payment ends quietly. */
    async cancel(paymentId) {
      const payment = await load(paymentId)
      if (payment.providerCaptureId || !OPEN.has(payment.status)) return paymentView(payment)
      const done = await settlement.fail(paymentId, 'payer_cancelled', { actor: 'buyer', notify: false })
      return paymentView(done.payment)
    },

    /* For the webhook: finds the payment a capture belongs to, by what we put on the order, then by PayPal's ids. */
    async findForCapture(capture) {
      const byId = /^[0-9a-f-]{36}$/.test(capture.customId ?? '') ? await payments.findById(capture.customId) : null
      return (
        byId ??
        (capture.orderId ? await payments.findByOrderId(capture.orderId) : null) ??
        (capture.captureId ? await payments.findByCaptureId(capture.captureId) : null)
      )
    },

    applyCapture,
  }
}
