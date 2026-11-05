/* Risk checks in the database: the numbers the rules need about a buyer's recent behaviour, and the assessments that
   come out. The signals query is the ONE place those numbers are worked out, for a payment being made right now and for
   the history alike. It never reads a country, a name or a language: none of them is in it.
   Pass a transaction handle as `db` to run several of these together. */
import { camelize } from '#server/lib/case.js'

/* Declines that look like card testing. A low balance on a local method (insufficient_funds) is a normal day, so it
   is not here. */
const PROBING_DECLINES = "('card_declined', 'paypal_declined', 'authentication_failed')"

export function createRiskRepository({ db }) {
  return {
    /* For each input { buyerId, merchantId, at, methodId }, how the buyer behaved just before `at` (null means now).
       Answers one object per input, in order. Only payments made before `at` count, so a payment never counts itself. */
    async signals(inputs) {
      if (inputs.length === 0) return []
      const rows = await db.query(
        `with input as (
           select t.buyer_id, t.merchant_id, coalesce(t.moment, now()) as moment, t.method_id, t.n
             from unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::text[])
                  with ordinality as t(buyer_id, merchant_id, moment, method_id, n)
         )
         select i.n,
                (select count(*)::int from public.payments q
                  where q.buyer_id = i.buyer_id and q.created_at < i.moment and q.created_at >= i.moment - interval '1 hour'
                    and q.status = 'failed' and q.failure_code in ${PROBING_DECLINES}) as declines_last_hour,
                (select count(*)::int from public.payments q
                  where q.buyer_id = i.buyer_id and q.created_at < i.moment
                    and q.created_at >= i.moment - interval '10 minutes') as attempts_last_10m,
                (select count(distinct m)::int from (
                   select q.method_id as m from public.payments q
                    where q.buyer_id = i.buyer_id and q.created_at < i.moment and q.created_at >= i.moment - interval '1 hour'
                   union select i.method_id) tried) as methods_last_hour,
                (select count(*)::int from public.payments q
                  where q.merchant_id = i.merchant_id and q.buyer_id <> i.buyer_id and q.created_at < i.moment
                    and q.created_at >= i.moment - interval '2 minutes') as others_to_seller_last_2m,
                (select count(*)::int from public.payments q
                  where q.buyer_id = i.buyer_id and q.created_at < i.moment
                    and q.status in ('succeeded', 'refunded')) as prior_paid,
                (select count(*)::int from public.payments q
                  where q.buyer_id = i.buyer_id and q.created_at < i.moment and q.status = 'refunded') as prior_refunds,
                (select count(*)::int from public.payments q
                  where q.buyer_id = i.buyer_id and q.created_at < i.moment
                    and q.created_at >= i.moment - interval '24 hours' and q.status = 'blocked') as blocked_last_24h
           from input i
          order by i.n`,
        [
          inputs.map((input) => input.buyerId),
          inputs.map((input) => input.merchantId),
          inputs.map((input) => input.at ?? null),
          inputs.map((input) => input.methodId),
        ],
      )
      /* Exactly the inputs the rules take, in the order asked for. The position column is dropped. */
      return camelize(rows).map((row) => ({
        declinesLastHour: row.declinesLastHour,
        attemptsLast10m: row.attemptsLast10m,
        methodsLastHour: row.methodsLastHour,
        othersToSellerLast2m: row.othersToSellerLast2m,
        priorPaid: row.priorPaid,
        priorRefunds: row.priorRefunds,
        blockedLast24h: row.blockedLast24h,
      }))
    },

    async insertAssessment(row) {
      await db.query(
        `insert into public.risk_assessments
           (payment_id, score, level, decision, enforced, signals, explanation, explanation_source, model, engine)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
         on conflict (payment_id) do nothing`,
        [
          row.paymentId,
          row.score,
          row.level,
          row.decision,
          row.enforced,
          JSON.stringify(row.signals),
          row.explanation,
          row.explanationSource,
          row.model ?? null,
          row.engine,
        ],
      )
    },

    /* Many at once, for scoring the history. created_at follows the payment, so the history reads in the right order. */
    async insertAssessments(rows) {
      if (rows.length === 0) return 0
      const inserted = await db.query(
        `insert into public.risk_assessments
           (payment_id, score, level, decision, enforced, signals, explanation, explanation_source, model, engine, created_at)
         select t.payment_id, t.score::smallint, t.level, t.decision, t.enforced, t.signals::jsonb, t.explanation,
                t.explanation_source, t.model, t.engine, t.created_at
           from unnest($1::uuid[], $2::int[], $3::text[], $4::text[], $5::boolean[], $6::text[], $7::text[], $8::text[],
                       $9::text[], $10::text[], $11::timestamptz[])
                as t(payment_id, score, level, decision, enforced, signals, explanation, explanation_source, model, engine, created_at)
         on conflict (payment_id) do nothing
         returning payment_id`,
        [
          rows.map((row) => row.paymentId),
          rows.map((row) => row.score),
          rows.map((row) => row.level),
          rows.map((row) => row.decision),
          rows.map((row) => row.enforced),
          rows.map((row) => JSON.stringify(row.signals)),
          rows.map((row) => row.explanation),
          rows.map((row) => row.explanationSource),
          rows.map((row) => row.model ?? null),
          rows.map((row) => row.engine),
          rows.map((row) => row.createdAt),
        ],
      )
      return inserted.length
    },

    /* The AI's wording replaces the rules' own. */
    async setExplanation(paymentId, { explanation, source, model }) {
      await db.query(
        'update public.risk_assessments set explanation = $2, explanation_source = $3, model = $4 where payment_id = $1',
        [paymentId, explanation, source, model ?? null],
      )
    },

    async findByPayment(paymentId) {
      const [row] = await db.query('select * from public.risk_assessments where payment_id = $1', [paymentId])
      return row ? camelize(row) : null
    },

    /* The decision of the person who reviewed it. Only a payment not yet reviewed can be reviewed. */
    async applyReview(paymentId, { decision, note }) {
      const rows = await db.query(
        `update public.risk_assessments set review_decision = $2, review_note = $3, reviewed_at = now()
          where payment_id = $1 and review_decision is null returning payment_id`,
        [paymentId, decision, note ?? null],
      )
      return rows.length > 0
    },

    /* Payments nobody has scored yet, oldest first: what is left to do when the history is scored. */
    async unscored(limit) {
      const rows = await db.query(
        `select p.id, p.buyer_id, p.merchant_id, p.method_id, p.status, p.created_at, p.amount_usd_cents, b.email
           from public.payments p
           join public.buyers b on b.id = p.buyer_id
          where not exists (select 1 from public.risk_assessments r where r.payment_id = p.id)
          order by p.created_at, p.id
          limit $1`,
        [limit],
      )
      return camelize(rows)
    },
  }
}
