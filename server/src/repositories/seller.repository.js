/* What a seller sees of their own business: totals and trends, payments, customers, countries and methods, payouts and
   payment links. Every query is scoped to one merchant. Money is integer US cents. Periods are [from, to) in UTC.
   Pass a transaction handle as `db` to run several of these together. */
import { camelize } from '#server/lib/case.js'

/* A payment with what a table or a detail view needs. */
const PAYMENT_ROW = `
  select p.id, p.reference, p.status, p.failure_code, p.provider, p.origin, p.payout_id, p.link_id,
         p.amount_usd_cents, p.fee_usd_cents, p.net_usd_cents, p.display_currency, p.display_amount_minor,
         p.card_brand, p.card_last4, p.created_at, p.completed_at,
         pr.id as product_id, pr.slug as product_slug, pr.title as product_title,
         b.id as buyer_id, b.full_name as buyer_name, b.email as buyer_email,
         c.code as country_code, c.name as country_name,
         m.id as method_id, m.label as method_label, m.kind as method_kind,
         l.title as link_title, l.code as link_code
    from public.payments p
    join public.products pr on pr.id = p.product_id
    join public.buyers b on b.id = p.buyer_id
    join public.countries c on c.code = p.country_code
    join public.payment_methods m on m.id = p.method_id
    left join public.payment_links l on l.id = p.link_id`

/* Text typed in a search box, made safe for ilike: % and _ are matched as themselves. */
const likeOf = (text) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/* The WHERE of a payments query, and its values, from the filters a screen sends. */
function paymentFilters(merchantId, { status, method, country, link, q, from, to } = {}) {
  const values = [merchantId]
  const where = ['p.merchant_id = $1']
  const add = (sql, value) => {
    values.push(value)
    where.push(sql.replaceAll('?', `$${values.length}`))
  }
  if (status) add('p.status = ?', status)
  if (method) add('p.method_id = ?', method)
  if (country) add('p.country_code = ?', country)
  if (link) add('p.link_id = ?', link)
  if (from) add('p.created_at >= ?', from)
  if (to) add('p.created_at < ?', to)
  if (q) add('(p.reference ilike ? or b.full_name ilike ? or b.email ilike ?)', likeOf(q))
  return { where: where.join(' and '), values }
}

const SORTS = {
  newest: 'p.created_at desc, p.id',
  oldest: 'p.created_at asc, p.id',
  amount: 'p.amount_usd_cents desc, p.created_at desc',
}

export function createSellerRepository({ db }) {
  return {
    /* ---- Overview ---------------------------------------------------------------------------------------------- */

    /* The numbers of one period. Sales are paid payments; the success rate counts only attempts that have ended. */
    async totals(merchantId, from, to) {
      const [row] = await db.query(
        `select count(*) filter (where status = 'succeeded')::int as paid,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::bigint as gross,
                coalesce(sum(fee_usd_cents) filter (where status = 'succeeded'), 0)::bigint as fees,
                coalesce(sum(amount_usd_cents) filter (where status = 'refunded'), 0)::bigint as refunded,
                count(distinct buyer_id) filter (where status = 'succeeded')::int as customers
           from public.payments
          where merchant_id = $1 and created_at >= $2 and created_at < $3`,
        [merchantId, from, to],
      )
      return Object.fromEntries(Object.entries(camelize(row)).map(([key, value]) => [key, Number(value)]))
    },

    /* Checkout visits and how many ended in a payment. */
    async visits(merchantId, from, to) {
      const [row] = await db.query(
        `select count(*)::int as visits, count(*) filter (where outcome = 'paid')::int as paid
           from public.checkout_sessions
          where merchant_id = $1 and created_at >= $2 and created_at < $3`,
        [merchantId, from, to],
      )
      return camelize(row)
    },

    /* One row per day, even a day with no sales. */
    async daily(merchantId, from, to) {
      const rows = await db.query(
        `select (d at time zone 'UTC')::date::text as day,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as gross,
                count(p.id) filter (where p.status = 'succeeded')::int as payments
           from generate_series($2::timestamptz, $3::timestamptz - interval '1 day', interval '1 day') d
           left join public.payments p
                  on p.merchant_id = $1 and p.created_at >= d and p.created_at < d + interval '1 day'
          group by d order by d`,
        [merchantId, from, to],
      )
      return rows.map((row) => ({ day: row.day, gross: Number(row.gross), payments: row.payments }))
    },

    async byMethod(merchantId, from, to) {
      const rows = await db.query(
        `select m.id, m.label, m.kind,
                coalesce(sum(p.amount_usd_cents), 0)::bigint as gross, count(*)::int as payments
           from public.payments p join public.payment_methods m on m.id = p.method_id
          where p.merchant_id = $1 and p.status = 'succeeded' and p.created_at >= $2 and p.created_at < $3
          group by m.id order by gross desc`,
        [merchantId, from, to],
      )
      return rows.map((row) => ({ ...camelize(row), gross: Number(row.gross) }))
    },

    async byCountry(merchantId, from, to, limit = 8) {
      const rows = await db.query(
        `select c.code, c.name, coalesce(sum(p.amount_usd_cents), 0)::bigint as gross, count(*)::int as payments
           from public.payments p join public.countries c on c.code = p.country_code
          where p.merchant_id = $1 and p.status = 'succeeded' and p.created_at >= $2 and p.created_at < $3
          group by c.code order by gross desc limit $4`,
        [merchantId, from, to, limit],
      )
      return rows.map((row) => ({ ...camelize(row), gross: Number(row.gross) }))
    },

    /* What the seller is owed: paid sales no payout covers yet, net of ProneBridge's fee. "real" are genuine PayPal sales. */
    async balance(merchantId) {
      const [row] = await db.query(
        `select count(*)::int as payments,
                coalesce(sum(net_usd_cents), 0)::bigint as owed,
                count(*) filter (where provider = 'paypal' and origin = 'app')::int as real_payments,
                coalesce(sum(net_usd_cents) filter (where provider = 'paypal' and origin = 'app'), 0)::bigint as real_owed
           from public.payments
          where merchant_id = $1 and status = 'succeeded' and payout_id is null`,
        [merchantId],
      )
      return {
        payments: row.payments,
        owed: Number(row.owed),
        realPayments: row.real_payments,
        realOwed: Number(row.real_owed),
      }
    },

    /* ---- Payments ---------------------------------------------------------------------------------------------- */

    async payments(merchantId, filters = {}, { sort = 'newest', limit = 500, offset = 0 } = {}) {
      const { where, values } = paymentFilters(merchantId, filters)
      const rows = await db.query(
        `${PAYMENT_ROW} where ${where} order by ${SORTS[sort] ?? SORTS.newest} limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      )
      const [{ total }] = await db.query(
        `select count(*)::int as total from public.payments p join public.buyers b on b.id = p.buyer_id where ${where}`,
        values,
      )
      return { rows: camelize(rows), total }
    },

    async payment(merchantId, id) {
      const [row] = await db.query(`${PAYMENT_ROW} where p.merchant_id = $1 and p.id = $2`, [merchantId, id])
      return row ? camelize(row) : null
    },

    async paymentEvents(paymentId) {
      const rows = await db.query(
        'select type, actor, data, created_at from public.payment_events where payment_id = $1 order by id',
        [paymentId],
      )
      return camelize(rows)
    },

    /* ---- Customers --------------------------------------------------------------------------------------------- */

    async customers(merchantId, { q, id, limit = 500 } = {}) {
      const values = [merchantId]
      let search = ''
      if (id) {
        values.push(id)
        search += ` and b.id = $${values.length}`
      }
      if (q) {
        values.push(likeOf(q))
        search += ` and (b.full_name ilike $${values.length} or b.email ilike $${values.length})`
      }
      values.push(limit)
      const rows = await db.query(
        `select b.id, b.full_name as name, b.email, c.code as country_code, c.name as country_name,
                count(*) filter (where p.status = 'succeeded')::int as orders,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as spent,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'refunded'), 0)::bigint as refunded,
                min(p.created_at) as first_at, max(p.created_at) as last_at,
                (select count(*)::int from public.enrollments e join public.products pr on pr.id = e.product_id
                  where e.buyer_id = b.id and pr.merchant_id = $1) as courses
           from public.buyers b
           join public.payments p on p.buyer_id = b.id and p.merchant_id = $1
           join public.countries c on c.code = b.country_code
          where true${search}
          group by b.id, c.code
          order by spent desc, last_at desc
          limit $${values.length}`,
        values,
      )
      return rows.map((row) => ({ ...camelize(row), spent: Number(row.spent), refunded: Number(row.refunded) }))
    },

    async customer(merchantId, id) {
      return (await this.customers(merchantId, { id, limit: 1 }))[0] ?? null
    },

    async customerPayments(merchantId, buyerId) {
      const rows = await db.query(
        `${PAYMENT_ROW} where p.merchant_id = $1 and p.buyer_id = $2 order by p.created_at desc`,
        [merchantId, buyerId],
      )
      return camelize(rows)
    },

    async customerCourses(merchantId, buyerId) {
      const rows = await db.query(
        `select pr.id, pr.slug, pr.title, e.granted_at
           from public.enrollments e join public.products pr on pr.id = e.product_id
          where e.buyer_id = $2 and pr.merchant_id = $1 order by e.granted_at desc`,
        [merchantId, buyerId],
      )
      return camelize(rows)
    },

    /* ---- Countries and methods --------------------------------------------------------------------------------- */

    /* Every active country with every method ProneBridge has there, and whether this seller has it switched on. */
    async catalog(merchantId) {
      const rows = await db.query(
        `select c.code, c.name, c.region, c.currency, c.currency_name, c.sort as country_sort,
                m.id as method_id, m.kind, m.label, m.provider, cm.sort as method_sort,
                cm.enabled as platform_enabled, cm.status as corridor_status,
                coalesce(mm.enabled, false) as merchant_enabled
           from public.countries c
           join public.country_methods cm on cm.country_code = c.code
           join public.payment_methods m on m.id = cm.method_id
           left join public.merchant_methods mm
                  on mm.merchant_id = $1 and mm.country_code = cm.country_code and mm.method_id = cm.method_id
          where c.active
          order by c.sort, cm.sort`,
        [merchantId],
      )
      return camelize(rows)
    },

    /* Visits by country, and where the ones that did not pay gave up. */
    async countryVisits(merchantId, from, to) {
      const rows = await db.query(
        `select country_code,
                count(*)::int as visits,
                count(*) filter (where outcome = 'paid')::int as paid,
                count(*) filter (where outcome = 'abandoned' and abandon_stage = 'country')::int as left_at_country,
                count(*) filter (where outcome = 'abandoned' and abandon_stage = 'method')::int as left_at_method,
                count(*) filter (where outcome = 'abandoned' and abandon_stage = 'payment')::int as left_at_payment
           from public.checkout_sessions
          where merchant_id = $1 and created_at >= $2 and created_at < $3
          group by country_code`,
        [merchantId, from, to],
      )
      return camelize(rows)
    },

    /* Payments by country and method. */
    async countryMethodPayments(merchantId, from, to) {
      const rows = await db.query(
        `select country_code, method_id,
                count(*)::int as attempts,
                count(*) filter (where status = 'succeeded')::int as paid,
                count(*) filter (where status in ('succeeded', 'failed'))::int as finished,
                coalesce(sum(amount_usd_cents) filter (where status = 'succeeded'), 0)::bigint as gross
           from public.payments
          where merchant_id = $1 and created_at >= $2 and created_at < $3
          group by country_code, method_id`,
        [merchantId, from, to],
      )
      return rows.map((row) => ({ ...camelize(row), gross: Number(row.gross) }))
    },

    async methodRow(countryCode, methodId) {
      const [row] = await db.query(
        'select enabled, status from public.country_methods where country_code = $1 and method_id = $2',
        [countryCode, methodId],
      )
      return row ?? null
    },

    async setMethod(merchantId, countryCode, methodId, enabled) {
      await db.query(
        `insert into public.merchant_methods (merchant_id, country_code, method_id, enabled) values ($1, $2, $3, $4)
         on conflict (merchant_id, country_code, method_id) do update set enabled = excluded.enabled`,
        [merchantId, countryCode, methodId, enabled],
      )
    },

    async audit({ actor = 'seller', actorId, action, entityType, entityId, data = {} }) {
      await db.query(
        'insert into public.audit_log (actor, actor_id, action, entity_type, entity_id, data) values ($1, $2, $3, $4, $5, $6::jsonb)',
        [actor, actorId, action, entityType, entityId, JSON.stringify(data)],
      )
    },

    /* ---- Payouts ----------------------------------------------------------------------------------------------- */

    async payouts(merchantId, limit = 100) {
      const rows = await db.query(
        `select id, reference, merchant_id, amount_usd_cents, status, provider, recipient_email, paypal_batch_id,
                paypal_item_id, failure_code, payments_count, period_start::text as period_start,
                period_end::text as period_end, origin, created_at, paid_at
           from public.payouts where merchant_id = $1 order by created_at desc, id limit $2`,
        [merchantId, limit],
      )
      return camelize(rows)
    },

    async payout(merchantId, id) {
      const [row] = await db.query(
        `select id, reference, merchant_id, amount_usd_cents, status, provider, recipient_email, paypal_batch_id,
                paypal_item_id, failure_code, payments_count, period_start::text as period_start,
                period_end::text as period_end, origin, created_at, paid_at
           from public.payouts where merchant_id = $1 and id = $2`,
        [merchantId, id],
      )
      return row ? camelize(row) : null
    },

    async payoutPayments(payoutId) {
      const rows = await db.query(
        `select p.id, p.reference, p.created_at, p.amount_usd_cents, p.fee_usd_cents, p.net_usd_cents,
                b.full_name as buyer_name, pr.title as product_title
           from public.payments p join public.buyers b on b.id = p.buyer_id join public.products pr on pr.id = p.product_id
          where p.payout_id = $1 order by p.created_at desc`,
        [payoutId],
      )
      return camelize(rows)
    },

    async payoutTotals(merchantId) {
      const [row] = await db.query(
        `select coalesce(sum(amount_usd_cents) filter (where status = 'paid'), 0)::bigint as paid,
                coalesce(sum(amount_usd_cents) filter (where status in ('scheduled', 'processing')), 0)::bigint as on_its_way,
                count(*) filter (where status = 'paid')::int as paid_count
           from public.payouts where merchant_id = $1`,
        [merchantId],
      )
      return { paid: Number(row.paid), onItsWay: Number(row.on_its_way), paidCount: row.paid_count }
    },

    /* ---- Payment links ----------------------------------------------------------------------------------------- */

    async links(merchantId) {
      const rows = await db.query(
        `select l.id, l.code, l.title, l.note, l.max_uses, l.expires_at, l.active, l.created_at,
                pr.slug as product_slug, pr.title as product_title, pr.price_usd_cents,
                (select count(*)::int from public.checkout_sessions s where s.link_id = l.id) as visits,
                count(p.id) filter (where p.status = 'succeeded')::int as paid,
                coalesce(sum(p.amount_usd_cents) filter (where p.status = 'succeeded'), 0)::bigint as revenue
           from public.payment_links l
           join public.products pr on pr.id = l.product_id
           left join public.payments p on p.link_id = l.id
          where l.merchant_id = $1
          group by l.id, pr.id
          order by l.created_at desc`,
        [merchantId],
      )
      return rows.map((row) => ({ ...camelize(row), revenue: Number(row.revenue) }))
    },

    async link(merchantId, id) {
      return (await this.links(merchantId)).find((link) => link.id === id) ?? null
    },

    async findProduct(merchantId, slug) {
      const [row] = await db.query(
        'select id, slug, title, price_usd_cents from public.products where merchant_id = $1 and slug = $2 and published',
        [merchantId, slug],
      )
      return row ? camelize(row) : null
    },

    /* Answers the new link's id, or null when the code is already taken. */
    async insertLink({ code, merchantId, productId, title, note, maxUses, expiresAt }) {
      const [row] = await db.query(
        `insert into public.payment_links (code, merchant_id, product_id, title, note, max_uses, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (code) do nothing
         returning id`,
        [code, merchantId, productId, title, note ?? null, maxUses ?? null, expiresAt ?? null],
      )
      return row?.id ?? null
    },

    async setLinkActive(merchantId, id, active) {
      const rows = await db.query(
        'update public.payment_links set active = $3 where merchant_id = $1 and id = $2 returning id',
        [merchantId, id, active],
      )
      return rows.length > 0
    },
  }
}
