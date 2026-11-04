/* The payment simulator. Local methods (mobile money, bank transfer, USSD, cash voucher) are not connected to any real
   provider in this demo. This service plays the part of the provider's answer: the buyer chose an outcome on screen, and
   it settles the payment that way. It only ever touches payments whose provider is "simulated", and it settles them
   through the same service a real provider would use. */
import { badRequest, conflict, notFound } from '#server/lib/errors.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { paymentView } from './payment.view.js'

/* The reason a simulated decline or time-out gives, per method. */
const DECLINE = {
  mobile_money: 'insufficient_funds',
  bank_transfer: 'transfer_not_received',
  ussd: 'insufficient_funds',
  voucher: 'voucher_expired',
}
const TIMEOUT = {
  mobile_money: 'approval_timeout',
  bank_transfer: 'transfer_not_received',
  ussd: 'session_expired',
  voucher: 'voucher_expired',
}

export const OUTCOMES = ['approve', 'decline', 'timeout']

export function createSimulatorService({ db, settlement }) {
  const payments = createPaymentRepository({ db })

  return {
    async settle(paymentId, outcome) {
      if (!OUTCOMES.includes(outcome)) throw badRequest('Choose approve, decline or timeout.')
      const payment = await payments.findById(paymentId)
      if (!payment) throw notFound('We could not find that payment.')
      if (payment.provider !== 'simulated') throw conflict('Only simulated payments can be settled here.')

      const actor = 'system'
      const data = { simulated: true, outcome }
      const result =
        outcome === 'approve'
          ? await settlement.succeed(paymentId, { actor, data })
          : await settlement.fail(
              paymentId,
              (outcome === 'decline' ? DECLINE : TIMEOUT)[payment.methodId] ?? 'approval_timeout',
              { actor, data },
            )
      return paymentView(result.payment)
    },
  }
}
