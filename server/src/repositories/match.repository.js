/* What Method Match needs: the methods on offer in a country, and how payments with each one have ended. Outcomes are
   counted across every seller, because a payment method's reliability belongs to the method, not to one seller. A
   payment held or blocked for risk says nothing about the method, so it is not counted. */
import { camelize } from '#server/lib/case.js'

export function createMatchRepository({ db }) {
  return {
    /* The methods this seller can take in this country right now: switched on, opened by ProneBridge, not down. */
    async offers(merchantId, countryCode) {
      const rows = await db.query(
        `select m.id, m.kind, m.label, m.provider, cm.status, cm.sort
           from public.country_methods cm
           join public.payment_methods m on m.id = cm.method_id
           join public.countries c on c.code = cm.country_code and c.active
           left join public.merchant_methods mm
                  on mm.merchant_id = $1 and mm.country_code = cm.country_code and mm.method_id = cm.method_id
          where cm.country_code = $2 and cm.enabled and cm.status <> 'down' and coalesce(mm.enabled, false)
          order by cm.sort`,
        [merchantId, countryCode],
      )
      return camelize(rows)
    },

    /* Paid and finished payments per method since a date, in one country or (without one) everywhere. */
    async outcomes(since, countryCode = null) {
      const rows = await db.query(
        `select method_id,
                count(*) filter (where status in ('succeeded', 'refunded'))::int as paid,
                count(*) filter (where status in ('succeeded', 'refunded', 'failed'))::int as finished
           from public.payments
          where created_at >= $1 and ($2::text is null or country_code = $2)
          group by method_id`,
        [since, countryCode],
      )
      return new Map(rows.map((row) => [row.method_id, { paid: row.paid, finished: row.finished }]))
    },
  }
}
