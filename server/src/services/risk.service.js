/* Fraud checks. Every payment is scored by the rules in lib/risk.js before any money moves:
     low     the payment goes ahead as usual
     medium  it is held in the review queue ("in_review"). A person approves or rejects it
     high    it is blocked at once ("blocked"), and the buyer, the seller and the admin are told
   The rules decide. The AI writes the short explanation a reviewer reads, from the rules' own findings only: it is never
   told who the buyer is or where they are, and its words never change a decision. Without the AI, or past the day's
   budget, the rules' own sentence is kept. */
import { formatUsd } from '#shared/money.js'
import { conflict, notFound } from '#server/lib/errors.js'
import { shortName } from '#server/lib/ids.js'
import { ENGINE, isThrowawayEmail, rulesExplanation, scoreRisk } from '#server/lib/risk.js'
import { createAuditRepository } from '#server/repositories/audit.repository.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { createRiskRepository } from '#server/repositories/risk.repository.js'
import { cleanText } from './ai.service.js'

/* How long a buyer is made to wait for the AI's wording. Past it, the rules' own sentence stands. */
const EXPLAIN_WAIT_MS = 6000

const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: { explanation: { type: 'string' } },
  required: ['explanation'],
  additionalProperties: false,
}

const EXPLAIN_INSTRUCTIONS = [
  'You write a short note for a person who reviews risky payments at a payments company.',
  'You get the rules that fired on one payment, each with what it saw, and the decision taken.',
  'In one or two plain sentences, say why the payment was held or blocked, using only those facts. Add no other facts.',
  'You are not told who the buyer is or where they are. Never guess or mention a person, a country, a nationality, a language or a name.',
  'Do not accuse anyone. Say "the signals suggest", not that someone is a fraudster.',
  'Never use long dashes. At most 240 characters.',
].join(' ')

/* An AI note that strays onto who or where someone is gets thrown away. */
const OFF_LIMITS = /countr|nationalit|ethnic|\brace\b|language|region|continent|african/i

export function createRiskService({ db, ai, logger }) {
  const risk = createRiskRepository({ db })

  /* The score for a payment, from what the buyer did. `payment` can carry anything (a country, a name): only the fields
     named here are read, and the engine itself refuses the rest. */
  async function scoreFor(payment, handle = db) {
    const [signals] = await createRiskRepository({ db: handle }).signals([
      {
        buyerId: payment.buyerId,
        merchantId: payment.merchantId,
        methodId: payment.methodId,
        at: payment.at ?? null,
      },
    ])
    return scoreRisk({
      ...signals,
      throwawayEmail: isThrowawayEmail(payment.email),
      amountUsdCents: payment.amountUsdCents,
    })
  }

  /* The notifications a decision sends. The buyer is told in the same words whatever the reason. */
  async function notify(handle, { decision, payment, assessment }) {
    const repo = createPaymentRepository({ db: handle })
    const who = shortName(payment.buyerName)
    const amount = formatUsd(payment.amountUsdCents)
    const top = assessment.fired[0]?.label ?? 'risk rules'

    if (decision === 'block') {
      await repo.addNotification({
        audience: 'buyer',
        buyerId: payment.buyerId,
        kind: 'payment.blocked',
        level: 'danger',
        title: 'Payment not completed',
        body: 'A safety check stopped this payment. Nothing was charged.',
        paymentId: payment.id,
      })
      await repo.addNotification({
        audience: 'seller',
        merchantId: payment.merchantId,
        kind: 'risk.blocked',
        level: 'warning',
        title: 'Payment blocked',
        body: `${who} tried to buy ${payment.productTitle} for ${amount}. ProneBridge blocked it before any money moved.`,
        paymentId: payment.id,
      })
      await repo.addNotification({
        audience: 'admin',
        kind: 'risk.blocked',
        level: 'danger',
        title: 'High risk payment blocked',
        body: `${payment.reference}, ${amount}, score ${assessment.score}. Main signal: ${top}.`,
        paymentId: payment.id,
      })
    } else if (decision === 'review') {
      await repo.addNotification({
        audience: 'buyer',
        buyerId: payment.buyerId,
        kind: 'payment.review',
        level: 'info',
        title: 'We are checking your payment',
        body: 'This is a routine safety check. It usually takes a few minutes. Nothing has been charged.',
        paymentId: payment.id,
      })
      await repo.addNotification({
        audience: 'seller',
        merchantId: payment.merchantId,
        kind: 'risk.review',
        level: 'info',
        title: 'A payment is being checked',
        body: `${who}'s payment for ${payment.productTitle} (${amount}) is waiting for a safety check.`,
        paymentId: payment.id,
      })
      await repo.addNotification({
        audience: 'admin',
        kind: 'risk.review',
        level: 'warning',
        title: 'Payment needs review',
        body: `${payment.reference}, ${amount}, score ${assessment.score}. Main signal: ${top}.`,
        paymentId: payment.id,
      })
    }
  }

  const service = {
    scoreFor,

    /* Before a payment exists: score the buyer's behaviour, and say what status the new payment starts in. Runs inside
       the transaction that makes the payment. */
    async gate(handle, input) {
      const assessment = await scoreFor(input, handle)
      const status = { allow: null, review: 'in_review', block: 'blocked' }[assessment.decision]
      return { assessment, status, failureCode: assessment.decision === 'block' ? 'safety_check' : null }
    },

    /* After the payment row exists: keep the assessment, the timeline entry and the messages. Same transaction. */
    async record(handle, payment, assessment) {
      const events = createPaymentRepository({ db: handle })
      await createRiskRepository({ db: handle }).insertAssessment({
        paymentId: payment.id,
        score: assessment.score,
        level: assessment.level,
        decision: assessment.decision,
        enforced: true,
        signals: assessment.fired,
        explanation: rulesExplanation(assessment),
        explanationSource: 'rules',
        engine: assessment.engine,
      })
      if (assessment.decision === 'allow') return
      await events.addEvent({
        paymentId: payment.id,
        type: assessment.decision === 'block' ? 'blocked' : 'held_for_review',
        actor: 'system',
        data: { score: assessment.score, level: assessment.level, rules: assessment.fired.map((entry) => entry.id) },
      })
      await notify(handle, { decision: assessment.decision, payment, assessment })
    },

    /* The AI's wording for a held or blocked payment. Never changes the decision. Answers the new text, or null when the
       rules' own sentence stays (AI off, budget used, too slow, or the note strayed). */
    async explain(paymentId) {
      const found = await risk.findByPayment(paymentId)
      if (!found || found.level === 'low' || !ai.enabled) return null

      const facts = {
        decision: found.decision === 'block' ? 'blocked at once' : 'held for review by a person',
        score: found.score,
        rules_that_fired: found.signals.map((entry) => ({ rule: entry.label, points: entry.points, saw: entry.fact })),
      }
      let timer
      try {
        const result = await Promise.race([
          ai.run('risk.explain', {
            model: ai.models.fast,
            input: [
              { role: 'system', content: EXPLAIN_INSTRUCTIONS },
              { role: 'user', content: JSON.stringify(facts) },
            ],
            schema: EXPLAIN_SCHEMA,
            schemaName: 'risk_note',
            effort: 'none',
            maxOutputTokens: 300,
            timeoutMs: EXPLAIN_WAIT_MS,
          }),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), EXPLAIN_WAIT_MS + 500)
          }),
        ])
        const text = cleanText(result?.parsed?.explanation ?? '').slice(0, 320)
        const strayed = OFF_LIMITS.exec(text)
        if (!text || strayed) {
          /* Said so in the log, so how often it happens can be seen. The word is logged, never the buyer. */
          logger?.warn('risk explanation fell back to the rules', {
            reason: strayed ? 'strayed' : result ? 'empty' : 'too slow',
            word: strayed?.[0],
          })
          return null
        }
        await risk.setExplanation(paymentId, { explanation: text, source: 'ai', model: result.model })
        return text
      } catch (error) {
        logger?.warn('risk explanation fell back to the rules', { code: error.code ?? error.name })
        return null
      } finally {
        clearTimeout(timer)
      }
    },

    /* A person clears a held payment. The buyer can now finish paying. */
    approve: (paymentId, { note = null, adminId = 'admin' } = {}) =>
      service.decide(paymentId, 'approved', { note, adminId }),

    /* A person rejects a held payment. It is blocked, and the buyer and the seller are told. */
    reject: (paymentId, { note = null, adminId = 'admin' } = {}) =>
      service.decide(paymentId, 'rejected', { note, adminId }),

    async decide(paymentId, decision, { note, adminId }) {
      return db.tx(async (t) => {
        const repo = createPaymentRepository({ db: t })
        const reviews = createRiskRepository({ db: t })
        const payment = await repo.lockById(paymentId)
        if (!payment) throw notFound('We could not find that payment.')
        if (payment.status !== 'in_review') throw conflict('That payment is not waiting for a review.')
        if (!(await reviews.applyReview(paymentId, { decision, note })))
          throw conflict('That payment was already reviewed.')

        if (decision === 'approved') {
          await repo.clearReview(paymentId, payment.provider === 'paypal' ? 'requires_payment' : 'processing')
          await repo.addNotification({
            audience: 'buyer',
            buyerId: payment.buyerId,
            kind: 'payment.cleared',
            level: 'success',
            title: 'Payment cleared',
            body: 'The check is done. You can finish paying now.',
            paymentId,
          })
        } else {
          await repo.rejectReview(paymentId, 'safety_check')
          await repo.addNotification({
            audience: 'buyer',
            buyerId: payment.buyerId,
            kind: 'payment.blocked',
            level: 'danger',
            title: 'Payment not completed',
            body: 'A safety check stopped this payment. Nothing was charged.',
            paymentId,
          })
          await repo.addNotification({
            audience: 'seller',
            merchantId: payment.merchantId,
            kind: 'risk.rejected',
            level: 'warning',
            title: 'Payment declined after review',
            body: `${shortName(payment.buyerName)}'s payment for ${payment.productTitle} did not pass the safety check.`,
            paymentId,
          })
        }
        await repo.addEvent({
          paymentId,
          type: decision === 'approved' ? 'review_approved' : 'review_rejected',
          actor: 'admin',
          data: { note },
        })
        await createAuditRepository({ db: t }).record({
          actor: 'admin',
          actorId: adminId,
          action: decision === 'approved' ? 'risk.approved' : 'risk.rejected',
          entityType: 'payment',
          entityId: paymentId,
          data: { reference: payment.reference, note },
        })
        return { paymentId, status: decision === 'approved' ? 'cleared' : 'blocked', decision }
      })
    },

    /* Scores every payment nobody has scored yet, the demo history included. Those payments are already settled, so the
       decision is kept but not applied (enforced is false). Safe to run again: it only does what is left. */
    async scoreHistory({ batch = 1000 } = {}) {
      let scored = 0
      for (;;) {
        const rows = await risk.unscored(batch)
        if (rows.length === 0) return scored
        const signals = await risk.signals(
          rows.map((row) => ({
            buyerId: row.buyerId,
            merchantId: row.merchantId,
            methodId: row.methodId,
            at: new Date(row.createdAt).toISOString(),
          })),
        )
        const assessments = rows.map((row, index) => {
          const result = scoreRisk({
            ...signals[index],
            throwawayEmail: isThrowawayEmail(row.email),
            amountUsdCents: row.amountUsdCents,
          })
          const applied =
            result.decision === 'allow' ||
            (result.decision === 'review' && row.status === 'in_review') ||
            (result.decision === 'block' && row.status === 'blocked')
          return {
            paymentId: row.id,
            score: result.score,
            level: result.level,
            decision: result.decision,
            enforced: applied,
            signals: result.fired,
            explanation: rulesExplanation(result),
            explanationSource: 'rules',
            engine: ENGINE,
            createdAt: new Date(row.createdAt).toISOString(),
          }
        })
        const inserted = await risk.insertAssessments(assessments)
        scored += inserted
        if (inserted === 0) return scored
      }
    },
  }
  return service
}
