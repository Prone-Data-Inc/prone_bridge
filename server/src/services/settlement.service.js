/* Settles a payment: the one place where a payment becomes paid or failed, whatever rail it came from. The simulator calls
   it today; PayPal's webhook and capture call it in step 5. Everything happens in one transaction on a locked row, so a
   repeated or racing call changes nothing the second time:
     paid   -> status, timeline, access to the course, the checkout session, a message for the buyer and one for the seller
     failed -> status with the reason, timeline, a message for the buyer */
import { failureMessage } from '#shared/failures.js'
import { formatUsd } from '#shared/money.js'
import { notFound } from '#server/lib/errors.js'
import { shortName } from '#server/lib/ids.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'

const OPEN = new Set(['requires_payment', 'processing'])

export function createSettlementService({ db }) {
  async function settle(paymentId, result, { actor = 'system', data = {} } = {}) {
    return db.tx(async (t) => {
      const payments = createPaymentRepository({ db: t })
      const payment = await payments.lockById(paymentId)
      if (!payment) throw notFound('We could not find that payment.')
      if (!OPEN.has(payment.status)) return { payment, changed: false }

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
      return { payment: await payments.findById(paymentId), changed: true }
    })
  }

  return {
    succeed: (paymentId, options) => settle(paymentId, { ok: true }, options),
    fail: (paymentId, code, options) => settle(paymentId, { ok: false, code }, options),
  }
}
