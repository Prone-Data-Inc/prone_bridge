/* Reads and writes of payments, their timeline, the access they unlock and the checkout sessions they belong to.
   Pass a transaction handle as `db` to run several of these together. */
import { camelize } from '#server/lib/case.js'

/* A payment with what a screen or a message needs about it. */
const VIEW = `
  select p.id, p.reference, p.status, p.failure_code, p.provider, p.origin, p.idempotency_key,
         p.provider_order_id, p.provider_capture_id, p.card_brand, p.card_last4, p.payout_id,
         p.merchant_id, p.product_id, p.buyer_id, p.country_code, p.method_id,
         p.amount_usd_cents, p.fee_usd_cents, p.display_currency, p.display_amount_minor,
         p.fx_rate::float8 as fx_rate, p.created_at, p.completed_at,
         pr.slug as product_slug, pr.title as product_title,
         b.full_name as buyer_name, b.email as buyer_email,
         c.name as country_name, m.label as method_label
    from public.payments p
    join public.products pr on pr.id = p.product_id
    join public.buyers b on b.id = p.buyer_id
    join public.countries c on c.code = p.country_code
    join public.payment_methods m on m.id = p.method_id`

export function createPaymentRepository({ db }) {
  return {
    async findById(id) {
      const [row] = await db.query(`${VIEW} where p.id = $1`, [id])
      return row ? camelize(row) : null
    },

    async findByKey(key) {
      const [row] = await db.query(`${VIEW} where p.idempotency_key = $1`, [key])
      return row ? camelize(row) : null
    },

    async findByOrderId(orderId) {
      const [row] = await db.query(`${VIEW} where p.provider_order_id = $1`, [orderId])
      return row ? camelize(row) : null
    },

    async findByCaptureId(captureId) {
      const [row] = await db.query(`${VIEW} where p.provider_capture_id = $1`, [captureId])
      return row ? camelize(row) : null
    },

    /* Locks the payment until the transaction ends, so two settlements cannot both win. */
    async lockById(id) {
      const [row] = await db.query(`${VIEW} where p.id = $1 for update of p`, [id])
      return row ? camelize(row) : null
    },

    async insert(payment) {
      const [row] = await db.query(
        `insert into public.payments
           (reference, merchant_id, product_id, buyer_id, method_id, country_code, amount_usd_cents, display_currency,
            display_amount_minor, fx_rate, fee_usd_cents, status, provider, idempotency_key, origin)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'app')
         on conflict (idempotency_key) do nothing
         returning id`,
        [
          payment.reference,
          payment.merchantId,
          payment.productId,
          payment.buyerId,
          payment.methodId,
          payment.countryCode,
          payment.amountUsdCents,
          payment.displayCurrency,
          payment.displayAmountMinor,
          payment.fxRate,
          payment.feeUsdCents,
          payment.status,
          payment.provider,
          payment.idempotencyKey,
        ],
      )
      return row?.id ?? null
    },

    /* The PayPal order made for this payment. Set once: a second order for the same payment is never recorded. */
    async setOrder(id, orderId) {
      const rows = await db.query(
        'update public.payments set provider_order_id = $2 where id = $1 and provider_order_id is null returning id',
        [id, orderId],
      )
      return rows.length > 0
    },

    /* What PayPal captured: its id, and the card (brand and last four digits only) when one was used. */
    async recordCapture(id, { captureId, cardBrand = null, cardLast4 = null }) {
      await db.query(
        `update public.payments
            set provider_capture_id = coalesce($2, provider_capture_id),
                card_brand = coalesce($3, card_brand),
                card_last4 = coalesce($4, card_last4)
          where id = $1`,
        [id, captureId, cardBrand, cardLast4],
      )
    },

    /* The buyer has paid but PayPal has not confirmed yet. */
    async markProcessing(id) {
      await db.query("update public.payments set status = 'processing' where id = $1 and status = 'requires_payment'", [
        id,
      ])
    },

    async markRefunded(id) {
      await db.query("update public.payments set status = 'refunded' where id = $1 and status = 'succeeded'", [id])
    },

    async revokeAccess(paymentId) {
      await db.query('delete from public.enrollments where payment_id = $1', [paymentId])
    },

    /* A payment that never reached PayPal (its order could not be made) leaves nothing behind. */
    async removeUnstarted(id) {
      await db.query(
        "delete from public.payments where id = $1 and status = 'requires_payment' and provider_order_id is null",
        [id],
      )
    },

    async markSucceeded(id) {
      await db.query("update public.payments set status = 'succeeded', completed_at = now() where id = $1", [id])
    },

    async markFailed(id, code) {
      await db.query(
        "update public.payments set status = 'failed', failure_code = $2, completed_at = now() where id = $1",
        [id, code],
      )
    },

    async addEvent({ paymentId, type, actor, data = {} }) {
      await db.query(
        'insert into public.payment_events (payment_id, type, actor, data) values ($1, $2, $3, $4::jsonb)',
        [paymentId, type, actor, JSON.stringify(data)],
      )
    },

    async grantAccess({ buyerId, productId, paymentId }) {
      await db.query(
        `insert into public.enrollments (buyer_id, product_id, payment_id) values ($1, $2, $3)
         on conflict (buyer_id, product_id) do nothing`,
        [buyerId, productId, paymentId],
      )
    },

    async addNotification({ audience, merchantId = null, buyerId = null, kind, level, title, body, paymentId = null }) {
      await db.query(
        `insert into public.notifications (audience, merchant_id, buyer_id, kind, level, title, body, payment_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [audience, merchantId, buyerId, kind, level, title, body, paymentId],
      )
    },

    /* Checkout sessions: the visit that leads to a payment. */
    async createSession({ merchantId, productId, countryCode }) {
      const [row] = await db.query(
        `insert into public.checkout_sessions (merchant_id, product_id, country_code) values ($1, $2, $3) returning id`,
        [merchantId, productId, countryCode],
      )
      return row.id
    },

    async updateSessionCountry(id, countryCode) {
      const rows = await db.query(
        "update public.checkout_sessions set country_code = $2 where id = $1 and outcome = 'open' returning id",
        [id, countryCode],
      )
      return rows.length > 0
    },

    async attachToSession({ sessionId, buyerId, paymentId, countryCode }) {
      await db.query(
        `update public.checkout_sessions set buyer_id = $2, payment_id = $3, country_code = $4
          where id = $1 and outcome = 'open'`,
        [sessionId, buyerId, paymentId, countryCode],
      )
    },

    async closeSessionOf(paymentId) {
      await db.query("update public.checkout_sessions set outcome = 'paid', closed_at = now() where payment_id = $1", [
        paymentId,
      ])
    },
  }
}
