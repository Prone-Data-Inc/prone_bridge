/* What the admin sees across the whole network: every seller, every payment, the risk checks, the corridors and the
   payouts. Money is integer US cents. Periods are [from, to) in UTC. */
import { camelize } from '#server/lib/case.js'

/* A payment with what a table or a detail view needs, and its risk score when it has one. `extra` adds columns after
   the risk ones (starting with a comma). */
const paymentRow = (extra = '') => `
  select p.id, p.reference, p.status, p.failure_code, p.provider, p.origin, p.payout_id,
         p.amount_usd_cents, p.fee_usd_cents, p.net_usd_cents, p.display_currency, p.display_amount_minor,
         p.card_brand, p.card_last4, p.created_at, p.completed_at,
         mer.id as merchant_id, mer.slug as merchant_slug, mer.name as merchant_name,
         pr.id as product_id, pr.slug as product_slug, pr.title as product_title,
         b.id as buyer_id, b.full_name as buyer_name, b.email as buyer_email,
         c.code as country_code, c.name as country_name,
         m.id as method_id, m.label as method_label, m.kind as method_kind,
         r.score as risk_score, r.level as risk_level, r.decision as risk_decision, r.enforced as risk_enforced${extra}
    from public.payments p
    join public.merchants mer on mer.id = p.merchant_id
    join public.products pr on pr.id = p.product_id
    join public.buyers b on b.id = p.buyer_id
    join public.countries c on c.code = p.country_code
    join public.payment_methods m on m.id = p.method_id
    left join public.risk_assessments r on r.payment_id = p.id`

const PAYMENT_ROW = paymentRow()

const likeOf = (text) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

function paymentFilters({ status, merchant, method, country, level, q, from, to } = {}) {
  const values = []
  const where = ['true']
  const add = (sql, value) => {
    values.push(value)
    where.push(sql.replaceAll('?', `$${values.length}`))
  }
  if (status) add('p.status = ?', status)
  if (merchant) add('mer.slug = ?', merchant)
  if (method) add('p.method_id = ?', method)
  if (country) add('p.country_code = ?', country)
  if (level) add('r.level = ?', level)
  if (from) add('p.created_at >= ?', from)
  if (to) add('p.created_at < ?', to)
  if (q) add('(p.reference ilike ? or b.full_name ilike ? or b.email ilike ? or mer.name ilike ?)', likeOf(q))
  return { where: where.join(' and '), values }
}

const SORTS = {
  newest: 'p.created_at desc, p.id',
  oldest: 'p.created_at asc, p.id',
  amount: 'p.amount_usd_cents desc, p.created_at desc',
  risk: 'r.score desc nulls last, p.created_at desc',
}

const numbers = (row) => Object.fromEntries(Object.entries(camelize(row)).map(([key, value]) => [key, Number(value)]))

export function createAdminRepository({ db }) {
  return {
    /* ---- Overview ---------------------------------------------------------------------------------------------- */

    async totals(from, to) {
      const [row] = await db.query(
        `select count(*) filter (where status = 'succeeded')::int as paid,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::bigint as gross,
                coalesce(sum(fee_usd_cents) filter (where status = 'succeeded'), 0)::bigint as fees,
                count(distinct merchant_id) filter (where status = 'succeeded')::int as sellers,
                count(*) filter (where status = 'blocked')::int as blocked,
                coalesce(sum(amount_usd_cents) filter (where status = 'blocked'), 0)::bigint as blocked_amount
           from public.payments where created_at >= $1 and created_at < $2`,
        [from, to],
      )
      return numbers(row)
    },

    async daily(from, to) {
      const rows = await db.query(
        `select (d at time zone 'UTC')::date::text as day,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as gross,
                count(p.id) filter (where p.status = 'succeeded')::int as payments,
                count(p.id) filter (where p.status = 'blocked')::int as blocked
           from generate_series($1::timestamptz, $2::timestamptz - interval '1 day', interval '1 day') d
           left join public.payments p on p.created_at >= d and p.created_at < d + interval '1 day'
          group by d order by d`,
        [from, to],
      )
      return rows.map((row) => ({
        day: row.day,
        gross: Number(row.gross),
        payments: row.payments,
        blocked: row.blocked,
      }))
    },

    /* How the payments scored in a period were rated. */
    async riskMix(from, to) {
      const [row] = await db.query(
        `select count(*)::int as scored,
                count(*) filter (where level = 'low')::int as low,
                count(*) filter (where level = 'medium')::int as medium,
                count(*) filter (where level = 'high')::int as high
           from public.risk_assessments where created_at >= $1 and created_at < $2`,
        [from, to],
      )
      return row
    },

    /* What is waiting for a person right now. */
    async queueSummary() {
      const [row] = await db.query(
        `select count(*)::int as waiting, coalesce(sum(amount_usd_cents), 0)::bigint as amount, min(created_at) as oldest
           from public.payments where status = 'in_review'`,
      )
      return { waiting: row.waiting, amountUsdCents: Number(row.amount), oldest: row.oldest }
    },

    async corridorHealth() {
      const rows = await db.query(
        `select cm.status, count(*)::int as n from public.country_methods cm
           join public.countries c on c.code = cm.country_code and c.active
          where cm.enabled group by cm.status`,
      )
      return Object.fromEntries(rows.map((row) => [row.status, row.n]))
    },

    /* The corridors that are not fully working. */
    async troubledCorridors() {
      const rows = await db.query(
        `select c.code as country_code, c.name as country_name, m.id as method_id, m.label as method_label, cm.status
           from public.country_methods cm
           join public.countries c on c.code = cm.country_code and c.active
           join public.payment_methods m on m.id = cm.method_id
          where cm.enabled and cm.status <> 'operational'
          order by (cm.status = 'down') desc, c.name`,
      )
      return camelize(rows)
    },

    /* The latest payments the rules held or blocked. */
    async flagged(limit) {
      const rows = await db.query(
        `${paymentRow(', r.explanation as risk_explanation')} where r.level <> 'low' and r.enforced order by p.created_at desc limit $1`,
        [limit],
      )
      return camelize(rows)
    },

    /* ---- Transactions ------------------------------------------------------------------------------------------ */

    async payments(filters = {}, { sort = 'newest', limit = 500, offset = 0 } = {}) {
      const { where, values } = paymentFilters(filters)
      const rows = await db.query(
        `${PAYMENT_ROW} where ${where} order by ${SORTS[sort] ?? SORTS.newest} limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      )
      const [{ total }] = await db.query(
        `select count(*)::int as total
           from public.payments p
           join public.merchants mer on mer.id = p.merchant_id
           join public.buyers b on b.id = p.buyer_id
           left join public.risk_assessments r on r.payment_id = p.id
          where ${where}`,
        values,
      )
      return { rows: camelize(rows), total }
    },

    async payment(id) {
      const [row] = await db.query(`${PAYMENT_ROW} where p.id = $1`, [id])
      return row ? camelize(row) : null
    },

    async paymentEvents(paymentId) {
      const rows = await db.query(
        'select type, actor, data, created_at from public.payment_events where payment_id = $1 order by id',
        [paymentId],
      )
      return camelize(rows)
    },

    /* ---- Risk review ------------------------------------------------------------------------------------------- */

    async assessment(paymentId) {
      const [row] = await db.query('select * from public.risk_assessments where payment_id = $1', [paymentId])
      return row ? camelize(row) : null
    },

    /* The payments waiting for a person, with what the rules found. Oldest first: they have waited longest. */
    async queue() {
      const rows = await db.query(
        `${paymentRow(', r.signals as risk_signals, r.explanation as risk_explanation, r.explanation_source as risk_explanation_source')}
          where p.status = 'in_review' order by p.created_at, p.id`,
      )
      return camelize(rows)
    },

    /* Payments a person has already decided, newest decision first. */
    async reviewed(limit) {
      const rows = await db.query(
        `${paymentRow(', r.review_decision, r.review_note, r.reviewed_at, r.explanation as risk_explanation, r.explanation_source as risk_explanation_source')}
          where r.review_decision is not null order by r.reviewed_at desc limit $1`,
        [limit],
      )
      return camelize(rows)
    },

    /* ---- Merchants --------------------------------------------------------------------------------------------- */

    async merchants(from, to) {
      const rows = await db.query(
        `select mer.id, mer.slug, mer.name, mer.tagline, mer.country_code, mer.status, mer.created_at,
                (select count(*)::int from public.products pr where pr.merchant_id = mer.id and pr.published) as products,
                count(p.id) filter (where p.status = 'succeeded')::int as paid,
                count(p.id) filter (where p.status in ('succeeded', 'failed'))::int as finished,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as gross,
                count(p.id) filter (where p.status = 'blocked')::int as blocked,
                count(p.id) filter (where p.status = 'in_review')::int as in_review,
                (select coalesce(sum(q.net_usd_cents), 0)::bigint from public.payments q
                  where q.merchant_id = mer.id and q.status = 'succeeded' and q.payout_id is null) as owed,
                (select count(*)::int from public.merchant_methods mm where mm.merchant_id = mer.id and mm.enabled) as methods_on
           from public.merchants mer
           left join public.payments p on p.merchant_id = mer.id and p.created_at >= $1 and p.created_at < $2
          group by mer.id
          order by gross desc, mer.name`,
        [from, to],
      )
      return rows.map((row) => ({ ...camelize(row), gross: Number(row.gross), owed: Number(row.owed) }))
    },

    /* ---- Corridors --------------------------------------------------------------------------------------------- */

    async corridors(from, to) {
      const rows = await db.query(
        `select c.code as country_code, c.name as country_name, c.region, m.id as method_id, m.label as method_label,
                m.kind as method_kind, m.provider, cm.enabled, cm.status,
                (select count(*)::int from public.merchant_methods mm
                  where mm.country_code = cm.country_code and mm.method_id = cm.method_id and mm.enabled) as sellers_on,
                count(p.id)::int as attempts,
                count(p.id) filter (where p.status in ('succeeded', 'refunded'))::int as paid,
                count(p.id) filter (where p.status in ('succeeded', 'refunded', 'failed'))::int as finished,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as gross
           from public.country_methods cm
           join public.countries c on c.code = cm.country_code and c.active
           join public.payment_methods m on m.id = cm.method_id
           left join public.payments p on p.country_code = cm.country_code and p.method_id = cm.method_id
                and p.created_at >= $1 and p.created_at < $2
          group by c.code, m.id, cm.country_code, cm.method_id, cm.enabled, cm.status, cm.sort
          order by c.name, cm.sort`,
        [from, to],
      )
      return rows.map((row) => ({ ...camelize(row), gross: Number(row.gross) }))
    },

    async corridor(countryCode, methodId) {
      const [row] = await db.query(
        `select cm.enabled, cm.status, c.name as country_name, m.label as method_label
           from public.country_methods cm
           join public.countries c on c.code = cm.country_code
           join public.payment_methods m on m.id = cm.method_id
          where cm.country_code = $1 and cm.method_id = $2`,
        [countryCode, methodId],
      )
      return row ? camelize(row) : null
    },

    async setCorridor(countryCode, methodId, { status, enabled }) {
      await db.query(
        `update public.country_methods set status = coalesce($3, status), enabled = coalesce($4, enabled)
          where country_code = $1 and method_id = $2`,
        [countryCode, methodId, status ?? null, enabled ?? null],
      )
    },

    /* The sellers that have a method switched on in a country, to tell them when it changes. */
    async sellersWith(countryCode, methodId) {
      const rows = await db.query(
        'select merchant_id from public.merchant_methods where country_code = $1 and method_id = $2 and enabled',
        [countryCode, methodId],
      )
      return rows.map((row) => row.merchant_id)
    },

    /* ---- Settlements ------------------------------------------------------------------------------------------- */

    async payouts(limit = 200) {
      const rows = await db.query(
        `select po.id, po.reference, po.merchant_id, mer.name as merchant_name, mer.slug as merchant_slug,
                po.amount_usd_cents, po.status, po.provider, po.recipient_email, po.failure_code, po.payments_count,
                po.period_start::text as period_start, po.period_end::text as period_end, po.origin,
                po.created_at, po.paid_at
           from public.payouts po join public.merchants mer on mer.id = po.merchant_id
          order by po.created_at desc, po.id limit $1`,
        [limit],
      )
      return camelize(rows)
    },

    async settlementTotals() {
      const [row] = await db.query(
        `select coalesce(sum(amount_usd_cents) filter (where status = 'paid'), 0)::bigint as paid,
                coalesce(sum(amount_usd_cents) filter (where status in ('scheduled', 'processing')), 0)::bigint as on_its_way,
                count(*) filter (where status = 'failed')::int as failed,
                count(*) filter (where provider = 'paypal')::int as via_paypal
           from public.payouts`,
      )
      const [owed] = await db.query(
        `select coalesce(sum(net_usd_cents), 0)::bigint as owed, count(*)::int as payments
           from public.payments where status = 'succeeded' and payout_id is null`,
      )
      return {
        paid: Number(row.paid),
        onItsWay: Number(row.on_its_way),
        failed: row.failed,
        viaPaypal: row.via_paypal,
        owed: Number(owed.owed),
        owedPayments: owed.payments,
      }
    },

    /* ---- Fairness ---------------------------------------------------------------------------------------------- */

    /* How the scored payments of each country were rated. Only to look at: nothing here feeds a score. */
    async ratingsByCountry(from, to) {
      const rows = await db.query(
        `select c.code, c.name, c.region,
                count(r.id)::int as assessed,
                coalesce(avg(r.score), 0)::float8 as average_score,
                count(*) filter (where r.level = 'medium')::int as medium,
                count(*) filter (where r.level = 'high')::int as high
           from public.risk_assessments r
           join public.payments p on p.id = r.payment_id
           join public.countries c on c.code = p.country_code
          where r.created_at >= $1 and r.created_at < $2
          group by c.code order by c.name`,
        [from, to],
      )
      return camelize(rows)
    },

    /* A payment worth testing the rules on: the latest held or blocked one, otherwise the latest scored one. */
    async sampleForProbe() {
      const [row] = await db.query(
        `select p.id from public.payments p join public.risk_assessments r on r.payment_id = p.id
          order by (r.level <> 'low') desc, p.created_at desc limit 1`,
      )
      return row?.id ?? null
    },

    async countries() {
      return camelize(await db.query('select code, name from public.countries where active order by name'))
    },

    /* The data every payment carries that the rules read, for scoring one payment again. */
    async scoringInput(paymentId) {
      const [row] = await db.query(
        `select p.buyer_id, p.merchant_id, p.method_id, p.created_at, p.amount_usd_cents, b.email
           from public.payments p join public.buyers b on b.id = p.buyer_id where p.id = $1`,
        [paymentId],
      )
      return row ? camelize(row) : null
    },
  }
}
