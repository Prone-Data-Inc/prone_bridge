/* Payouts: money going to a seller, and the paid sales each payout covers. Pass a transaction handle as `db` to run
   several of these together. */
import { camelize } from '#server/lib/case.js'

const COLUMNS = `id, reference, merchant_id, amount_usd_cents, status, provider, recipient_email, paypal_batch_id,
                 paypal_item_id, failure_code, payments_count, period_start::text as period_start,
                 period_end::text as period_end, origin, created_at, paid_at`

/* A "real" payment is a genuine PayPal capture made through this app. Everything else (the simulated local methods and
   the demo history) is paid out in simulation only, so no demo number ever turns into a PayPal transfer. */
const KIND = {
  real: "p.provider = 'paypal' and p.origin = 'app'",
  simulated: "not (p.provider = 'paypal' and p.origin = 'app')",
}

export function createPayoutRepository({ db }) {
  return {
    /* Paid sales that no payout covers yet, locked so two runs cannot both claim them. */
    async unpaid(merchantId, kind) {
      const rows = await db.query(
        `select p.id, p.net_usd_cents, p.completed_at
           from public.payments p
          where p.merchant_id = $1 and p.status = 'succeeded' and p.payout_id is null and ${KIND[kind]}
          order by p.completed_at
            for update of p`,
        [merchantId],
      )
      return camelize(rows)
    },

    async insert(payout) {
      const [row] = await db.query(
        `insert into public.payouts
           (reference, merchant_id, amount_usd_cents, status, provider, recipient_email, payments_count, period_start,
            period_end, origin, paid_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'app', $10)
         returning ${COLUMNS}`,
        [
          payout.reference,
          payout.merchantId,
          payout.amountUsdCents,
          payout.status,
          payout.provider,
          payout.recipientEmail,
          payout.paymentsCount,
          payout.periodStart,
          payout.periodEnd,
          payout.paidAt ?? null,
        ],
      )
      return camelize(row)
    },

    async assign(paymentIds, payoutId) {
      await db.query('update public.payments set payout_id = $2 where id = any($1::uuid[])', [paymentIds, payoutId])
    },

    /* A payout that failed gives its sales back, so the next run pays them. */
    async release(payoutId) {
      await db.query('update public.payments set payout_id = null where payout_id = $1', [payoutId])
    },

    async update(id, { status, paypalBatchId, paypalItemId, failureCode, paidAt }) {
      const [row] = await db.query(
        `update public.payouts
            set status = coalesce($2, status),
                paypal_batch_id = coalesce($3, paypal_batch_id),
                paypal_item_id = coalesce($4, paypal_item_id),
                failure_code = coalesce($5, failure_code),
                paid_at = coalesce($6, paid_at)
          where id = $1
          returning ${COLUMNS}`,
        [id, status ?? null, paypalBatchId ?? null, paypalItemId ?? null, failureCode ?? null, paidAt ?? null],
      )
      return row ? camelize(row) : null
    },

    async findById(id) {
      const [row] = await db.query(`select ${COLUMNS} from public.payouts where id = $1`, [id])
      return row ? camelize(row) : null
    },

    /* PayPal reports a batch by the id we sent (the reference) or by its own batch id. */
    async findByBatch({ reference, batchId }) {
      const [row] = await db.query(
        `select ${COLUMNS} from public.payouts
          where ($1::text is not null and reference = $1) or ($2::text is not null and paypal_batch_id = $2)
          limit 1`,
        [reference ?? null, batchId ?? null],
      )
      return row ? camelize(row) : null
    },

    /* PayPal payouts still on their way: not yet sent, or sent and not yet final. */
    async open(merchantId) {
      const rows = await db.query(
        `select ${COLUMNS} from public.payouts
          where merchant_id = $1 and provider = 'paypal' and origin = 'app' and status in ('scheduled', 'processing')
          order by created_at`,
        [merchantId],
      )
      return camelize(rows)
    },

    async addNotification({ merchantId, kind, level, title, body }) {
      await db.query(
        `insert into public.notifications (audience, merchant_id, kind, level, title, body)
         values ('seller', $1, $2, $3, $4, $5)`,
        [merchantId, kind, level, title, body],
      )
    },
  }
}
