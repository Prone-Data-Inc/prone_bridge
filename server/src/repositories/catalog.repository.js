/* Reads of the catalog: merchants, their products, and which countries and payment methods each one offers. */
import { camelize } from '#server/lib/case.js'

export function createCatalogRepository({ db }) {
  return {
    async findMerchant(slug) {
      const [row] = await db.query(
        "select id, slug, name, tagline, country_code from public.merchants where slug = $1 and status = 'active'",
        [slug],
      )
      return row ? camelize(row) : null
    },

    async listProducts(merchantId) {
      const rows = await db.query(
        `select id, slug, title, subtitle, summary, category, level, lessons, hours::float8 as hours, price_usd_cents, cover
           from public.products
          where merchant_id = $1 and published
          order by category, price_usd_cents, title`,
        [merchantId],
      )
      return camelize(rows)
    },

    /* Every active country with the methods the platform offers there. A method is "enabled" when the merchant has it
       on and its corridor is not down. */
    async listCountries(merchantId) {
      const rows = await db.query(
        `select c.code, c.name, c.region, c.currency, c.currency_name, c.currency_symbol, c.minor_units, c.price_step,
                c.fx_per_usd::float8 as fx_per_usd, c.dial_code,
                coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id', m.id,
                      'kind', m.kind,
                      'label', m.label,
                      'hint', m.hint,
                      'provider', m.provider,
                      'simulated', m.provider = 'simulated',
                      'status', cm.status,
                      'enabled', coalesce(mm.enabled, false) and cm.status <> 'down'
                    ) order by cm.sort
                  ) filter (where m.id is not null),
                  '[]'::jsonb
                ) as methods
           from public.countries c
           left join public.country_methods cm on cm.country_code = c.code and cm.enabled
           left join public.payment_methods m on m.id = cm.method_id
           left join public.merchant_methods mm
                  on mm.merchant_id = $1 and mm.country_code = cm.country_code and mm.method_id = cm.method_id
          where c.active
          group by c.code
          order by c.sort`,
        [merchantId],
      )
      return camelize(rows)
    },
  }
}
