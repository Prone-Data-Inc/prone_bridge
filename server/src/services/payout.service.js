/* Paying sellers. A run gathers the paid sales no payout covers yet and pays them out in one go:
     real      genuine sandbox captures, sent to the seller through PayPal Payouts as one batch
     simulated everything else (local methods, the demo history), marked as a simulation and never sent anywhere
   The batch id sent to PayPal is the payout's own reference, so a retry after a dropped connection is the same payout,
   never a second one. PayPal reports the result back by webhook, and a run also asks PayPal about payouts still open, so
   the demo works without a public address too. */
import { formatUsd } from '#shared/money.js'
import { badGateway, notFound, unavailable } from '#server/lib/errors.js'
import { reference } from '#server/lib/ids.js'
import { PaypalError } from '#server/integrations/paypal/client.js'
import { createPayoutRepository } from '#server/repositories/payout.repository.js'

/* PayPal's batch and item statuses, in our three words. */
const BATCH = { SUCCESS: 'paid', PENDING: 'processing', PROCESSING: 'processing', DENIED: 'failed', CANCELED: 'failed' }
const ITEM = {
  SUCCESS: 'paid',
  PENDING: 'processing',
  ONHOLD: 'processing',
  UNCLAIMED: 'processing',
  FAILED: 'failed',
  BLOCKED: 'failed',
  RETURNED: 'failed',
  REFUNDED: 'failed',
  REVERSED: 'failed',
  CANCELED: 'failed',
  DENIED: 'failed',
}

const day = (value) => new Date(value).toISOString().slice(0, 10)

/* What the seller is told when a payout reaches each state. */
const messageFor = (payout, outcome) => {
  const amount = formatUsd(payout.amountUsdCents)
  return {
    paid: { kind: 'payout', level: 'success', title: 'Payout sent', body: `${amount} is on its way to you.` },
    processing: { kind: 'payout', level: 'info', title: 'Payout started', body: `${amount} is being sent to you.` },
    failed: {
      kind: 'payout.failed',
      level: 'warning',
      title: 'Payout did not go through',
      body: `${amount} could not be sent. It will be included in your next payout.`,
    },
  }[outcome]
}

export const payoutView = (payout) => ({
  id: payout.id,
  reference: payout.reference,
  status: payout.status,
  provider: payout.provider,
  simulated: payout.provider === 'simulated',
  amountUsdCents: payout.amountUsdCents,
  paymentsCount: payout.paymentsCount,
  recipientEmail: payout.recipientEmail,
  periodStart: payout.periodStart,
  periodEnd: payout.periodEnd,
  failureCode: payout.failureCode,
  createdAt: payout.createdAt,
  paidAt: payout.paidAt,
})

export function createPayoutService({ db, paypal, catalogRepository, env, logger }) {
  const payouts = createPayoutRepository({ db })

  async function merchantOrFail(slug) {
    const merchant = await catalogRepository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant
  }

  /* Moves a payout to what PayPal says. Only forward, so a late or repeated report changes nothing and tells the seller
     nothing twice. A paid payout can still end as failed: PayPal reports a returned or refunded one that way. */
  async function move(payout, next, { failureCode, paypalBatchId, paypalItemId } = {}) {
    const rank = { scheduled: 0, processing: 1, paid: 2, failed: 3 }
    if (!next || rank[next] <= rank[payout.status]) {
      if (paypalBatchId || paypalItemId) await payouts.update(payout.id, { paypalBatchId, paypalItemId })
      return payout
    }
    const updated = await db.tx(async (t) => {
      const repo = createPayoutRepository({ db: t })
      const row = await repo.update(payout.id, {
        status: next,
        paypalBatchId,
        paypalItemId,
        failureCode: next === 'failed' ? (failureCode ?? 'failed') : undefined,
        paidAt: next === 'paid' ? new Date().toISOString() : undefined,
      })
      if (next === 'failed') await repo.release(payout.id)
      return row
    })
    await payouts.addNotification({ merchantId: updated.merchantId, ...messageFor(updated, next) })
    return updated
  }

  /* Sends a real payout to PayPal. The same reference sent again is the same batch, so this can be repeated safely. */
  async function send(payout) {
    try {
      const result = await paypal.createPayout({
        batchId: payout.reference,
        subject: 'Your ProneBridge payout',
        items: [
          {
            itemId: `${payout.reference}-1`,
            receiver: payout.recipientEmail,
            amountUsdCents: payout.amountUsdCents,
            note: `ProneBridge payout ${payout.reference}`,
          },
        ],
      })
      return await move(payout, BATCH[result.status] ?? 'processing', {
        paypalBatchId: result.batchId,
        paypalItemId: `${payout.reference}-1`,
      })
    } catch (error) {
      if (!(error instanceof PaypalError)) throw error
      logger?.warn('paypal payout failed', { reference: payout.reference, status: error.status, issues: error.issues })
      /* Cannot reach PayPal: it may or may not have the batch. Keep it scheduled and send the same reference again later. */
      if (error.unreachable) return payout
      return move(payout, 'failed', { failureCode: error.issues[0] ?? error.code })
    }
  }

  /* Asks PayPal how an open payout is doing. */
  async function check(payout) {
    if (!payout.paypalBatchId) return payout.status === 'scheduled' ? send(payout) : payout
    try {
      const result = await paypal.getPayout(payout.paypalBatchId)
      const item = result.items[0]
      const next = item?.status ? ITEM[item.status] : BATCH[result.status]
      return await move(payout, next, { failureCode: item?.error ?? item?.status })
    } catch (error) {
      if (error instanceof PaypalError) return payout
      throw error
    }
  }

  async function gather(merchant, kind) {
    return db.tx(async (t) => {
      const repo = createPayoutRepository({ db: t })
      const sales = await repo.unpaid(merchant.id, kind)
      const amount = sales.reduce((sum, sale) => sum + sale.netUsdCents, 0)
      if (sales.length === 0 || amount <= 0) return null

      const real = kind === 'real'
      const payout = await repo.insert({
        reference: reference('po'),
        merchantId: merchant.id,
        amountUsdCents: amount,
        status: real ? 'scheduled' : 'paid',
        provider: real ? 'paypal' : 'simulated',
        recipientEmail: real ? env.paypal.payoutEmail : merchant.payoutEmail,
        paymentsCount: sales.length,
        periodStart: day(sales[0].completedAt),
        periodEnd: day(sales.at(-1).completedAt),
        paidAt: real ? null : new Date().toISOString(),
      })
      await repo.assign(
        sales.map((sale) => sale.id),
        payout.id,
      )
      if (!real) await repo.addNotification({ merchantId: merchant.id, ...messageFor(payout, 'paid') })
      return payout
    })
  }

  return {
    /* Pays out what is owed. Safe to call again at any time: it only ever pays sales once. */
    async run(merchantSlug) {
      const merchant = await merchantOrFail(merchantSlug)
      const done = []
      const skipped = []

      /* First, payouts already on their way: resend one that never reached PayPal, check the others. */
      if (paypal.enabled) for (const open of await payouts.open(merchant.id)) done.push(await check(open))

      const simulated = await gather(merchant, 'simulated')
      if (simulated) done.push(simulated)

      if (!paypal.enabled || !env.paypal.payoutEmail) {
        skipped.push({
          kind: 'paypal',
          reason: paypal.enabled
            ? 'Set PAYPAL_PAYOUT_EMAIL to a sandbox account to send real sandbox payouts.'
            : 'PayPal is not connected yet.',
        })
      } else {
        const real = await gather(merchant, 'real')
        if (real) done.push(await send(real))
      }

      return { payouts: done.map(payoutView), skipped }
    },

    async get(id) {
      const payout = await payouts.findById(id)
      if (!payout) throw notFound('We could not find that payout.')
      return payoutView(payout)
    },

    /* Asks PayPal about one payout now. */
    async refresh(id) {
      const payout = await payouts.findById(id)
      if (!payout) throw notFound('We could not find that payout.')
      if (payout.provider !== 'paypal') return payoutView(payout)
      if (!paypal.enabled) throw unavailable('PayPal is not connected yet.')
      try {
        return payoutView(await check(payout))
      } catch (error) {
        if (error instanceof PaypalError) throw badGateway()
        throw error
      }
    },

    /* PayPal's webhook: a batch or an item changed. Found by the id we sent, or by PayPal's batch id. */
    async applyReport({ senderBatchId, senderItemId, batchId, status, scope }) {
      const ours = senderBatchId ?? senderItemId?.replace(/-\d+$/, '') ?? null
      const payout = await payouts.findByBatch({ reference: ours, batchId })
      if (!payout) return false
      const next = (scope === 'item' ? ITEM : BATCH)[status]
      await move(payout, next, { failureCode: status, paypalBatchId: batchId ?? undefined })
      return true
    },
  }
}
