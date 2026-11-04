/* What a checkout needs to know before it takes a payment: the product, whether a method is on offer in a country, and
   who the buyer is. */
import { camelize } from '#server/lib/case.js'

export function createCheckoutRepository({ db }) {
  return {
    async findProduct(merchantId, slug) {
      const [row] = await db.query(
        `select id, slug, title, price_usd_cents from public.products where merchant_id = $1 and slug = $2 and published`,
        [merchantId, slug],
      )
      return row ? camelize(row) : null
    },

    /* The country, the method and whether this merchant may take it there right now. null when the pair does not exist. */
    async findOffer(merchantId, countryCode, methodId) {
      const [row] = await db.query(
        `select c.code as country_code, c.name as country_name, c.currency, c.minor_units, c.price_step,
                c.fx_per_usd::float8 as fx_per_usd, c.active as country_active,
                m.id as method_id, m.label, m.kind, m.provider, m.fee_bps, m.fee_fixed_cents,
                cm.enabled as platform_enabled, cm.status as corridor_status,
                coalesce(mm.enabled, false) as merchant_enabled
           from public.countries c
           join public.country_methods cm on cm.country_code = c.code
           join public.payment_methods m on m.id = cm.method_id
           left join public.merchant_methods mm
                  on mm.merchant_id = $1 and mm.country_code = c.code and mm.method_id = m.id
          where c.code = $2 and m.id = $3`,
        [merchantId, countryCode, methodId],
      )
      return row ? camelize(row) : null
    },

    async countryExists(code) {
      const [row] = await db.query('select 1 as found from public.countries where code = $1 and active', [code])
      return Boolean(row)
    },

    async owns(buyerId, productId) {
      const [row] = await db.query(
        'select 1 as found from public.enrollments where buyer_id = $1 and product_id = $2',
        [buyerId, productId],
      )
      return Boolean(row)
    },

    /* The same email is the same buyer. Name and country follow the latest checkout. */
    async upsertBuyer({ email, name, countryCode }) {
      const [row] = await db.query(
        `insert into public.buyers (email, full_name, country_code) values (lower($1), $2, $3)
         on conflict ((lower(email))) do update set full_name = excluded.full_name, country_code = excluded.country_code
         returning id, email, full_name`,
        [email, name, countryCode],
      )
      return camelize(row)
    },
  }
}
