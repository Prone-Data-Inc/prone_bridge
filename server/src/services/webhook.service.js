/* PayPal's webhooks. Nothing here is trusted until PayPal itself confirms the signature. A verified event is written to the
   inbox by its id, so a delivery PayPal repeats is recognised and does nothing. Then it is handled by what it says:
     PAYMENT.CAPTURE.COMPLETED, DECLINED, DENIED, PENDING  settle the payment, the same way the capture answer does
     PAYMENT.CAPTURE.REFUNDED, REVERSED                     give the money back and end access
     PAYMENT.PAYOUTSBATCH.* and PAYMENT.PAYOUTS-ITEM.*      move a seller payout along
   Anything else is kept in the inbox and ignored. A failure while handling answers 500, so PayPal sends it again. */
import { AppError, badRequest, unavailable } from '#server/lib/errors.js'
import { PaypalError } from '#server/integrations/paypal/client.js'
import { readCaptureResource } from '#server/integrations/paypal/mappers.js'
import { createWebhookRepository } from '#server/repositories/webhook.repository.js'

export function createWebhookService({ db, paypal, paypalService, settlement, payouts, logger }) {
  const inbox = createWebhookRepository({ db })

  /* Returns what was done, for the log and for tests: 'settled', 'refunded', 'payout', 'ignored' or 'unknown payment'. */
  async function handle(event) {
    const resource = event.resource ?? {}
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'PAYMENT.CAPTURE.DECLINED':
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.PENDING': {
        const capture = readCaptureResource(resource)
        /* DENIED is Payments v1 wording for a refusal, and the resource may not carry a status of its own. */
        if (event.event_type.endsWith('DENIED')) capture.captureStatus = 'DECLINED'
        const payment = await paypalService.findForCapture(capture)
        if (!payment) return 'unknown payment'
        await paypalService.applyCapture(payment, capture, 'paypal')
        return 'settled'
      }

      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        /* A refund resource names the capture it refunds in its links, not in its own id. */
        const link = (resource.links ?? []).find((entry) => entry.rel === 'up')?.href ?? ''
        const captureId = link.split('/captures/')[1]?.split(/[/?]/)[0] ?? resource.id
        const payment = await paypalService.findForCapture({
          customId: resource.custom_id,
          orderId: resource.supplementary_data?.related_ids?.order_id ?? null,
          captureId,
        })
        if (!payment) return 'unknown payment'
        await settlement.refund(payment.id, { actor: 'paypal', data: { event: event.event_type } })
        return 'refunded'
      }

      case 'PAYMENT.PAYOUTSBATCH.PROCESSING':
      case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
      case 'PAYMENT.PAYOUTSBATCH.DENIED': {
        const header = resource.batch_header ?? {}
        const found = await payouts.applyReport({
          senderBatchId: header.sender_batch_header?.sender_batch_id ?? null,
          batchId: header.payout_batch_id ?? null,
          status: header.batch_status ?? event.event_type.split('.').at(-1),
          scope: 'batch',
        })
        return found ? 'payout' : 'unknown payout'
      }

      default:
        if (event.event_type?.startsWith('PAYMENT.PAYOUTS-ITEM.')) {
          const found = await payouts.applyReport({
            senderBatchId: resource.sender_batch_id ?? null,
            senderItemId: resource.payout_item?.sender_item_id ?? null,
            batchId: resource.payout_batch_id ?? null,
            status: resource.transaction_status ?? event.event_type.split('.').at(-1),
            scope: 'item',
          })
          return found ? 'payout' : 'unknown payout'
        }
        return 'ignored'
    }
  }

  return {
    /* rawBody: the exact text PayPal sent. header: a function, a header name gives its value. */
    async receive({ rawBody, header }) {
      let event
      try {
        event = JSON.parse(rawBody)
      } catch {
        throw badRequest('That is not a PayPal event.')
      }
      if (!event?.id || !event?.event_type) throw badRequest('That is not a PayPal event.')

      let verified
      try {
        verified = await paypal.verifyWebhook({ header, event })
      } catch (error) {
        if (error instanceof PaypalError && error.code === 'NOT_CONFIGURED')
          throw unavailable('Webhooks are not set up yet.')
        /* PayPal could not be asked: answer 503 so PayPal sends the event again later. */
        if (error instanceof PaypalError) throw unavailable('We could not check that event. Try again.')
        throw error
      }
      if (!verified) {
        logger?.warn('paypal webhook signature rejected', { eventId: event.id, type: event.event_type })
        throw badRequest('The signature could not be verified.')
      }

      const state = await inbox.receive({
        id: event.id,
        eventType: event.event_type,
        resourceType: event.resource_type,
      })
      if (state === 'processed' || state === 'ignored') return { received: true, duplicate: true }

      try {
        const result = await handle(event)
        await inbox.finish(event.id, result === 'ignored' ? 'ignored' : 'processed')
        return { received: true, result }
      } catch (error) {
        await inbox.finish(event.id, 'failed', String(error?.message ?? error).slice(0, 300)).catch(() => {})
        /* A refusal of ours (the amount does not match, the payment is not ours) will not change on a second try, so
           PayPal is told it arrived. Anything unexpected answers 500 and PayPal sends the event again. */
        if (error instanceof AppError && error.status < 500) {
          logger?.warn('paypal webhook refused', { eventId: event.id, type: event.event_type, reason: error.message })
          return { received: true, result: 'rejected' }
        }
        throw error
      }
    },
  }
}
