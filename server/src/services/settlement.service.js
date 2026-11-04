/* Settles a payment: the one place where a payment becomes paid, failed or refunded, whatever rail it came from. The
   simulator, PayPal's capture and PayPal's webhook all call it. Everything happens in one transaction on a locked row, so
   a repeated or racing call changes nothing the second time:
     paid     -> status, timeline, access to the course, the checkout session, a message for the buyer and one for the seller
     failed   -> status with the reason, timeline, a message for the buyer
     refunded -> status, timeline, access taken back, a message for the buyer and one for the seller */
import { failureMessage } from '#shared/failures.js'
import { formatUsd } from '#shared/money.js'
import { notFound } from '#server/lib/errors.js'
import { shortName } from '#server/lib/ids.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'

const OPEN = new Set(['requires_payment', 'processing'])

export function createSettlementService({ db }) {
  /* capture: what PayPal says it captured, kept with the payment. notify: false keeps a failure quiet, for a buyer who
     closed the payment window on purpose and needs no message about it. */
  async function settle(paymentId, result, { actor = 'system', data = {}, capture = null, notify = true } = {}) {
    return db.tx(async (t) => {
      const payments = createPaymentRepository({ db: t })
      const payment = await payments.lockById(paymentId)
      if (!payment) throw notFound('We could not find that payment.')
      if (!OPEN.has(payment.status)) return { payment, changed: false }

      if (capture?.captureId) await payments.recordCapture(paymentId, capture)

      if (result.ok) {
        await payments.markSucceeded(paymentId)
        await payments.addEvent({ paymentId, type: 'succeeded', actor, data })
        await payments.grantAccess({ buyerId: payment.buyerId, productId: payment.productId, paymentId })
        await payments.closeSessionOf(paymentId)
        await payments.addNotification({
          audience: 'buyer',
          buyerId: payment.buyerId,
          kind: 'payment.succeeded',
          level: 'success',
          title: "You're in",
          body: `${payment.productTitle} is unlocked. Start learning.`,
          paymentId,
        })
        await payments.addNotification({
          audience: 'seller',
          merchantId: payment.merchantId,
          kind: 'sale',
          level: 'success',
          title: 'New sale',
          body: `${shortName(payment.buyerName)} bought ${payment.productTitle}. ${formatUsd(payment.amountUsdCents)} from ${payment.countryName}.`,
          paymentId,
        })
      } else {
        await payments.markFailed(paymentId, result.code)
        await payments.addEvent({ paymentId, type: 'failed', actor, data: { ...data, code: result.code } })
        if (notify) {
          await payments.addNotification({
            audience: 'buyer',
            buyerId: payment.buyerId,
            kind: 'payment.failed',
            level: 'danger',
            title: 'Payment did not go through',
            body: `${failureMessage(result.code)} Try again or choose another method.`,
            paymentId,
          })
        }
      }
      return { payment: await payments.findById(paymentId), changed: true }
    })
  }

  /* Money given back after a sale: PayPal refunded or reversed the capture. Only a paid payment can be refunded. */
  async function refund(paymentId, { actor = 'paypal', data = {} } = {}) {
    return db.tx(async (t) => {
      const payments = createPaymentRepository({ db: t })
      const payment = await payments.lockById(paymentId)
      if (!payment) throw notFound('We could not find that payment.')
      if (payment.status !== 'succeeded') return { payment, changed: false }

      await payments.markRefunded(paymentId)
      await payments.addEvent({ paymentId, type: 'refunded', actor, data })
      await payments.revokeAccess(paymentId)
      await payments.addNotification({
        audience: 'buyer',
        buyerId: payment.buyerId,
        kind: 'payment.refunded',
        level: 'info',
        title: 'Payment refunded',
        body: `${payment.productTitle} was refunded, so access to it has ended.`,
        paymentId,
      })
      await payments.addNotification({
        audience: 'seller',
        merchantId: payment.merchantId,
        kind: 'refund',
        level: 'warning',
        title: 'Payment refunded',
        body: `${shortName(payment.buyerName)} was refunded ${formatUsd(payment.amountUsdCents)} for ${payment.productTitle}.`,
        paymentId,
      })
      return { payment: await payments.findById(paymentId), changed: true }
    })
  }

  return {
    succeed: (paymentId, options) => settle(paymentId, { ok: true }, options),
    fail: (paymentId, code, options) => settle(paymentId, { ok: false, code }, options),
    refund,
  }
}
