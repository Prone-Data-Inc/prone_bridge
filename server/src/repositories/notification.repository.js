/* Reads and writes of notifications. Each audience (buyer, seller, admin) has its own scope: a seller sees its
   merchant's notifications, a buyer sees their own, the admin sees the admin ones. */
import { camelize } from '#server/lib/case.js'

/* $2 is the id the audience is scoped by (merchant, buyer, or nothing for the admin). */
const SCOPE = {
  seller: 'merchant_id = $2::uuid',
  buyer: 'buyer_id = $2::uuid',
  admin: '$2::uuid is null',
}

export function createNotificationRepository({ db }) {
  return {
    async list({ audience, scopeId, limit }) {
      const rows = await db.query(
        `select id, audience, kind, level, title, body, payment_id, read_at, created_at
           from public.notifications
          where audience = $1 and ${SCOPE[audience]}
          order by created_at desc
          limit $3`,
        [audience, scopeId, limit],
      )
      return camelize(rows)
    },

    /* Unread counts for the three audiences at once, for the badges on the tabs. */
    async unreadCounts({ merchantId, buyerId }) {
      const [row] = await db.query(
        `select count(*) filter (where audience = 'admin')::int as admin,
                count(*) filter (where audience = 'seller' and merchant_id = $1::uuid)::int as seller,
                count(*) filter (where audience = 'buyer' and buyer_id = $2::uuid)::int as buyer
           from public.notifications
          where read_at is null`,
        [merchantId, buyerId],
      )
      return row
    },

    /* ids null marks everything in scope. Returns how many were marked. */
    async markRead({ audience, scopeId, ids }) {
      const rows = await db.query(
        `update public.notifications
            set read_at = now()
          where audience = $1 and read_at is null and ${SCOPE[audience]}
            and ($3::uuid[] is null or id = any($3::uuid[]))
        returning id`,
        [audience, scopeId, ids],
      )
      return rows.length
    },
  }
}
