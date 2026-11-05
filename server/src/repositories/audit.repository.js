/* The audit log: who did what, kept for good. Sellers, the admin, the AI and the system all write here. Pass a transaction
   handle as `db` to write it together with the change it records. */
import { camelize } from '#server/lib/case.js'

/* Text typed in a search box, made safe for ilike. */
const likeOf = (text) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

export function createAuditRepository({ db }) {
  return {
    async record({ actor, actorId = null, action, entityType = null, entityId = null, data = {} }) {
      await db.query(
        'insert into public.audit_log (actor, actor_id, action, entity_type, entity_id, data) values ($1, $2, $3, $4, $5, $6::jsonb)',
        [actor, actorId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(data)],
      )
    },

    /* Newest first. actor and q (a search in the action and the ids) narrow it down. */
    async list({ actor, q, limit = 300, offset = 0 } = {}) {
      const values = []
      const where = []
      if (actor) {
        values.push(actor)
        where.push(`actor = $${values.length}`)
      }
      if (q) {
        values.push(likeOf(q))
        where.push(
          `(action ilike $${values.length} or entity_id ilike $${values.length} or actor_id ilike $${values.length})`,
        )
      }
      const clause = where.length ? `where ${where.join(' and ')}` : ''
      const rows = await db.query(
        `select id, actor, actor_id, action, entity_type, entity_id, data, created_at
           from public.audit_log ${clause}
          order by created_at desc, id desc
          limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      )
      const [{ total }] = await db.query(`select count(*)::int as total from public.audit_log ${clause}`, values)
      return { rows: camelize(rows).map((row) => ({ ...row, id: Number(row.id) })), total }
    },
  }
}
