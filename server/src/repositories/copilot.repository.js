/* The changes the copilot proposed. A proposal waits here until the seller confirms or dismisses it, or it expires. */
import { camelize } from '#server/lib/case.js'

export function createCopilotRepository({ db }) {
  return {
    async insert({ merchantId, kind, params, summary, expiresAt }) {
      const [row] = await db.query(
        `insert into public.copilot_actions (merchant_id, kind, params, summary, expires_at)
         values ($1, $2, $3::jsonb, $4, $5) returning id`,
        [merchantId, kind, JSON.stringify(params), summary, expiresAt],
      )
      return row.id
    },

    async find(merchantId, id) {
      const [row] = await db.query('select * from public.copilot_actions where merchant_id = $1 and id = $2', [
        merchantId,
        id,
      ])
      return row ? camelize(row) : null
    },

    async findMany(merchantId, ids) {
      if (ids.length === 0) return []
      const rows = await db.query(
        'select * from public.copilot_actions where merchant_id = $1 and id = any($2::uuid[]) order by created_at',
        [merchantId, ids],
      )
      return camelize(rows)
    },

    /* Waiting for a decision and not expired yet. */
    async pending(merchantId, at) {
      const rows = await db.query(
        `select * from public.copilot_actions
          where merchant_id = $1 and status = 'pending' and expires_at > $2 order by created_at desc limit 10`,
        [merchantId, at],
      )
      return camelize(rows)
    },

    /* Takes the proposal for the seller's decision, once. Answers it, or null when it is gone, decided or expired. */
    async claim(merchantId, id, status, at) {
      const [row] = await db.query(
        `update public.copilot_actions set status = $3, decided_at = now()
          where merchant_id = $1 and id = $2 and status = 'pending' and expires_at > $4 returning *`,
        [merchantId, id, status, at],
      )
      return row ? camelize(row) : null
    },

    async finish(id, status, result) {
      await db.query('update public.copilot_actions set status = $2, result = $3::jsonb where id = $1', [
        id,
        status,
        JSON.stringify(result ?? {}),
      ])
    },
  }
}
