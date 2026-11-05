/* What the demo director needs to know about the database: which methods are live, what is waiting, what is down, and
   what a reset has to keep. Reads only, apart from putting the AI usage count back after a reset. */
import { camelize } from '#server/lib/case.js'

export function createDemoRepository({ db }) {
  return {
    /* The simulated methods a seller can take right now, with their countries: switched on, opened, not down. */
    async liveOffers(merchantId) {
      const rows = await db.query(
        `select cm.country_code, c.name as country_name, m.id as method_id, m.label as method_label, cm.status
           from public.country_methods cm
           join public.countries c on c.code = cm.country_code and c.active
           join public.payment_methods m on m.id = cm.method_id and m.provider = 'simulated'
           join public.merchant_methods mm
                  on mm.merchant_id = $1 and mm.country_code = cm.country_code and mm.method_id = cm.method_id
          where mm.enabled and cm.enabled and cm.status <> 'down'`,
        [merchantId],
      )
      return camelize(rows)
    },

    /* Where the demo stands: what was made since the seed, and what waits for a person. */
    async counts() {
      const [row] = await db.query(
        `select count(*) filter (where origin = 'app')::int as made,
                count(*) filter (where status = 'in_review')::int as waiting
           from public.payments`,
      )
      return row
    },

    async troubledCorridors() {
      const rows = await db.query(
        `select cm.country_code, c.name as country_name, cm.method_id, m.label as method_label, cm.status
           from public.country_methods cm
           join public.countries c on c.code = cm.country_code
           join public.payment_methods m on m.id = cm.method_id
          where cm.status <> 'operational'
          order by c.name, cm.sort`,
      )
      return camelize(rows)
    },

    async owed(merchantId) {
      const [row] = await db.query(
        `select coalesce(sum(net_usd_cents), 0)::bigint as owed from public.payments
          where merchant_id = $1 and status = 'succeeded' and payout_id is null`,
        [merchantId],
      )
      return Number(row.owed)
    },

    /* How many of these payments the rule fired on. */
    async firedOn(paymentIds, ruleId) {
      if (paymentIds.length === 0) return 0
      const [row] = await db.query(
        `select count(*)::int as n from public.risk_assessments
          where payment_id = any($1::uuid[]) and signals @> $2::jsonb`,
        [paymentIds, JSON.stringify([{ id: ruleId }])],
      )
      return row.n
    },

    async assessmentOf(paymentId) {
      const [row] = await db.query(
        'select score, level, decision, signals, explanation, explanation_source from public.risk_assessments where payment_id = $1',
        [paymentId],
      )
      return row ? camelize(row) : null
    },

    /* How many seconds ago the demo was last reset, by the database's own clock, or null if it never was. */
    async secondsSinceReset() {
      const [row] = await db.query(
        "select extract(epoch from now() - max(created_at))::float8 as seconds from public.audit_log where action = 'demo.reset'",
      )
      return row?.seconds ?? null
    },

    /* The AI tokens spent today: kept across a reset, so a reset cannot be used to get a new budget. */
    async usageSince(since) {
      return camelize(
        await db.query(
          'select feature, model, input_tokens, output_tokens, created_at from public.ai_usage where created_at >= $1 order by id',
          [since],
        ),
      )
    },

    async restoreUsage(t, rows) {
      for (const row of rows) {
        await t.query(
          'insert into public.ai_usage (feature, model, input_tokens, output_tokens, created_at) values ($1, $2, $3, $4, $5)',
          [row.feature, row.model, row.inputTokens, row.outputTokens, row.createdAt],
        )
      }
    },
  }
}
