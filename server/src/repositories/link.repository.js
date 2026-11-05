/* Payment links, as the buyer's side needs them: found by their short code. */
import { camelize } from '#server/lib/case.js'

export function createLinkRepository({ db }) {
  return {
    async findByCode(code) {
      const [row] = await db.query(
        `select l.id, l.code, l.title, l.note, l.active, l.max_uses, l.expires_at, l.merchant_id, l.product_id,
                pr.slug as product_slug, pr.title as product_title, m.slug as merchant_slug, m.name as merchant_name,
                (select count(*)::int from public.payments p where p.link_id = l.id and p.status = 'succeeded') as paid
           from public.payment_links l
           join public.products pr on pr.id = l.product_id
           join public.merchants m on m.id = l.merchant_id
          where l.code = $1`,
        [code],
      )
      return row ? camelize(row) : null
    },
  }
}
