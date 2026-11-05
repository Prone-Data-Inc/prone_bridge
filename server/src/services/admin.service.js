/* The admin's view of the whole network: overview, transactions, the risk review queue, sellers, corridors, settlements,
   the fairness page and the audit log. The admin can do four things here: approve or reject a held payment, change the
   health of a corridor, run a seller's payout, and read everything else. There is no sign-in in this demo, so the admin
   is whoever opens the Admin tab. Every change is written to the audit log. */
import { failureMessage } from '#shared/failures.js'
import { badRequest, notFound } from '#server/lib/errors.js'
import { ENGINE, NEVER_USED, RISK_INPUTS, RULES, THRESHOLDS } from '#server/lib/risk.js'
import { createAdminRepository } from '#server/repositories/admin.repository.js'
import { createAuditRepository } from '#server/repositories/audit.repository.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { periodOf, timelineOf } from './seller.service.js'
import { payoutView } from './payout.service.js'

const share = (part, whole) => (whole > 0 ? part / whole : 0)
const change = (value, previous) => (previous > 0 ? (value - previous) / previous : null)
const metric = (value, previous) => ({ value, previous, delta: change(value, previous) })

/* A payment as the admin sees it: every seller, and the risk rating when there is one. */
export function adminPayment(row) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    failureCode: row.failureCode ?? null,
    failureMessage: row.failureCode ? failureMessage(row.failureCode) : null,
    provider: row.provider,
    simulated: row.provider === 'simulated',
    amountUsdCents: row.amountUsdCents,
    feeUsdCents: row.feeUsdCents,
    netUsdCents: row.netUsdCents,
    displayCurrency: row.displayCurrency,
    displayAmountMinor: row.displayAmountMinor,
    method: { id: row.methodId, label: row.methodLabel, kind: row.methodKind },
    country: { code: row.countryCode, name: row.countryName },
    product: { id: row.productId, slug: row.productSlug, title: row.productTitle },
    merchant: { id: row.merchantId, slug: row.merchantSlug, name: row.merchantName },
    buyer: { id: row.buyerId, name: row.buyerName, email: row.buyerEmail },
    card: row.cardLast4 ? { brand: row.cardBrand, last4: row.cardLast4 } : null,
    paidOut: Boolean(row.payoutId),
    risk: row.riskLevel
      ? { score: row.riskScore, level: row.riskLevel, decision: row.riskDecision, enforced: row.riskEnforced }
      : null,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }
}

/* The full rating of one payment: what fired, in words, and what a person decided. */
export function assessmentView(row) {
  return {
    score: row.score,
    level: row.level,
    decision: row.decision,
    enforced: row.enforced,
    signals: row.signals,
    explanation: row.explanation,
    explanationSource: row.explanationSource,
    engine: row.engine,
    review: row.reviewDecision ? { decision: row.reviewDecision, note: row.reviewNote, at: row.reviewedAt } : null,
    scoredAt: row.createdAt,
  }
}

/* A held payment with its rating, for the review queue. */
const queued = (row) => ({
  ...adminPayment(row),
  assessment: {
    signals: row.riskSignals ?? [],
    explanation: row.riskExplanation ?? '',
    explanationSource: row.riskExplanationSource ?? 'rules',
  },
})

const CORRIDOR_NOTICE = {
  down: (what) => ({
    level: 'danger',
    title: `${what} is down`,
    body: 'Buyers cannot use it until it recovers. We will tell you when it does.',
  }),
  degraded: (what) => ({
    level: 'warning',
    title: `${what} is slow`,
    body: 'Payments with it may take longer or fail. Method Match puts other methods first meanwhile.',
  }),
  operational: (what) => ({ level: 'success', title: `${what} is working again`, body: 'Buyers can use it as usual.' }),
  paused: (what) => ({
    level: 'warning',
    title: `${what} is paused`,
    body: 'ProneBridge paused it. Buyers cannot use it for now.',
  }),
  resumed: (what) => ({ level: 'info', title: `${what} is open again`, body: 'Buyers can use it again.' }),
}

export function createAdminService({ db, risk, payouts, ai, catalogRepository, now = () => new Date() }) {
  const admin = createAdminRepository({ db })
  const audit = createAuditRepository({ db })

  return {
    async overview(days) {
      const period = periodOf(days, now())
      const before = { from: period.previousFrom, to: period.from }
      const [totals, previous, daily, mix, queue, health, troubled, flagged, aiStatus, settlement] = await Promise.all([
        admin.totals(period.from, period.to),
        admin.totals(before.from, before.to),
        admin.daily(period.from, period.to),
        admin.riskMix(period.from, period.to),
        admin.queueSummary(),
        admin.corridorHealth(),
        admin.troubledCorridors(),
        admin.flagged(6),
        ai.status(),
        admin.settlementTotals(),
      ])

      const attention = []
      if (queue.waiting > 0) {
        attention.push({
          kind: 'review',
          level: 'warning',
          section: 'review',
          message: `${queue.waiting} payment${queue.waiting === 1 ? ' is' : 's are'} waiting for a review.`,
        })
      }
      for (const corridor of troubled.slice(0, 2)) {
        attention.push({
          kind: 'corridor',
          level: corridor.status === 'down' ? 'danger' : 'warning',
          section: 'corridors',
          message: `${corridor.methodLabel} in ${corridor.countryName} is ${corridor.status}.`,
        })
      }
      if (aiStatus.enabled && aiStatus.usedTokens >= aiStatus.dailyTokenBudget * 0.8) {
        attention.push({
          kind: 'ai',
          level: 'info',
          section: 'overview',
          message: 'The AI has used most of its budget for today.',
        })
      }

      return {
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        kpis: {
          gross: metric(totals.gross, previous.gross),
          payments: metric(totals.paid, previous.paid),
          successRate: metric(share(totals.paid, totals.finished), share(previous.paid, previous.finished)),
          blocked: metric(totals.blocked, previous.blocked),
          sellers: metric(totals.sellers, previous.sellers),
        },
        blockedUsdCents: totals.blockedAmount,
        series: {
          days: daily.map((entry) => entry.day),
          gross: daily.map((entry) => entry.gross),
          blocked: daily.map((entry) => entry.blocked),
        },
        risk: { scored: mix.scored, low: mix.low, medium: mix.medium, high: mix.high },
        queue: { waiting: queue.waiting, amountUsdCents: queue.amountUsdCents, oldestAt: queue.oldest },
        corridors: {
          operational: health.operational ?? 0,
          degraded: health.degraded ?? 0,
          down: health.down ?? 0,
          troubled: troubled.slice(0, 5),
        },
        settlements: { owedUsdCents: settlement.owed, owedPayments: settlement.owedPayments },
        flagged: flagged.map((row) => ({ ...adminPayment(row), explanation: row.riskExplanation })),
        ai: {
          enabled: aiStatus.enabled,
          usedTokens: aiStatus.usedTokens,
          dailyTokenBudget: aiStatus.dailyTokenBudget,
        },
        attention: attention.slice(0, 4),
      }
    },

    async transactions(filters, options) {
      const { rows, total } = await admin.payments(filters, options)
      return { payments: rows.map(adminPayment), total, shown: rows.length }
    },

    async transaction(id) {
      const row = await admin.payment(id)
      if (!row) throw notFound('We could not find that payment.')
      const [events, assessment] = await Promise.all([admin.paymentEvents(id), admin.assessment(id)])
      return {
        payment: adminPayment(row),
        timeline: timelineOf(events),
        assessment: assessment ? assessmentView(assessment) : null,
      }
    },

    async review() {
      const [queue, reviewed, summary] = await Promise.all([admin.queue(), admin.reviewed(12), admin.queueSummary()])
      return {
        waiting: summary.waiting,
        queue: queue.map(queued),
        recent: reviewed.map((row) => ({
          ...adminPayment(row),
          review: { decision: row.reviewDecision, note: row.reviewNote, at: row.reviewedAt },
          explanation: row.riskExplanation,
        })),
      }
    },

    async approve(id, note) {
      await risk.approve(id, { note })
      return { payment: adminPayment(await admin.payment(id)) }
    },

    async reject(id, note) {
      await risk.reject(id, { note })
      return { payment: adminPayment(await admin.payment(id)) }
    },

    async merchants(days) {
      const period = periodOf(days, now())
      const rows = await admin.merchants(period.from, period.to)
      return {
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        merchants: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          tagline: row.tagline,
          countryCode: row.countryCode,
          status: row.status,
          products: row.products,
          methodsOn: row.methodsOn,
          paid: row.paid,
          grossUsdCents: row.gross,
          successRate: share(row.paid, row.finished),
          blocked: row.blocked,
          inReview: row.inReview,
          owedUsdCents: row.owed,
          joinedAt: row.createdAt,
        })),
      }
    },

    async corridors(days) {
      const period = periodOf(days, now())
      const rows = await admin.corridors(period.from, period.to)
      const corridors = rows.map((row) => ({
        countryCode: row.countryCode,
        countryName: row.countryName,
        region: row.region,
        method: { id: row.methodId, label: row.methodLabel, kind: row.methodKind },
        simulated: row.provider === 'simulated',
        enabled: row.enabled,
        status: row.status,
        sellersOn: row.sellersOn,
        attempts: row.attempts,
        paid: row.paid,
        successRate: share(row.paid, row.finished),
        grossUsdCents: row.gross,
      }))
      const count = (status) => corridors.filter((entry) => entry.enabled && entry.status === status).length
      return {
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        summary: { operational: count('operational'), degraded: count('degraded'), down: count('down') },
        corridors,
      }
    },

    /* Change how a corridor is doing, or pause it. Sellers that use it are told. */
    async setCorridor(countryCode, methodId, { status, enabled }, adminId = 'admin') {
      if (status === undefined && enabled === undefined) throw badRequest('Choose a status or switch it on or off.')
      const before = await admin.corridor(countryCode, methodId)
      if (!before) throw notFound('That method is not offered in that country.')
      const next = { status: status ?? before.status, enabled: enabled ?? before.enabled }
      if (next.status === before.status && next.enabled === before.enabled)
        return { corridor: { countryCode, methodId, ...next } }

      const sellers = await admin.sellersWith(countryCode, methodId)
      await db.tx(async (t) => {
        await createAdminRepository({ db: t }).setCorridor(countryCode, methodId, next)
        await createAuditRepository({ db: t }).record({
          actor: 'admin',
          actorId: adminId,
          action: 'corridor.changed',
          entityType: 'corridor',
          entityId: `${countryCode}:${methodId}`,
          data: { before: { status: before.status, enabled: before.enabled }, after: next },
        })
        const what = `${before.methodLabel} in ${before.countryName}`
        const key = !next.enabled ? 'paused' : !before.enabled ? 'resumed' : next.status
        const notice = CORRIDOR_NOTICE[key](what)
        const repo = createPaymentRepository({ db: t })
        for (const merchantId of sellers) {
          await repo.addNotification({ audience: 'seller', merchantId, kind: 'corridor', ...notice })
        }
      })
      return { corridor: { countryCode, methodId, ...next } }
    },

    async settlements() {
      const month = periodOf(30, now())
      const [totals, payoutRows, merchants] = await Promise.all([
        admin.settlementTotals(),
        admin.payouts(),
        admin.merchants(month.from, month.to),
      ])
      return {
        totals: {
          paidUsdCents: totals.paid,
          onItsWayUsdCents: totals.onItsWay,
          owedUsdCents: totals.owed,
          owedPayments: totals.owedPayments,
          failed: totals.failed,
          viaPaypal: totals.viaPaypal,
        },
        owed: merchants
          .filter((merchant) => merchant.owed > 0)
          .map((merchant) => ({ slug: merchant.slug, name: merchant.name, owedUsdCents: merchant.owed })),
        payouts: payoutRows.map((row) => ({
          ...payoutView(row),
          merchant: { id: row.merchantId, slug: row.merchantSlug, name: row.merchantName },
        })),
      }
    },

    async runSettlement(merchantSlug, adminId = 'admin') {
      const merchant = await catalogRepository.findMerchant(merchantSlug)
      if (!merchant) throw notFound('We could not find that seller.')
      const result = await payouts.run(merchantSlug)
      await audit.record({
        actor: 'admin',
        actorId: adminId,
        action: 'settlement.run',
        entityType: 'merchant',
        entityId: merchant.slug,
        data: { payouts: result.payouts.length },
      })
      return result
    },

    /* Everything the Fairness page shows. The lists come from the code that scores, so they cannot drift from it. */
    async fairness(days) {
      const period = periodOf(days, now())
      const rows = await admin.ratingsByCountry(period.from, period.to)
      const countries = rows.map((row) => ({
        code: row.code,
        name: row.name,
        region: row.region,
        assessed: row.assessed,
        averageScore: row.averageScore,
        medium: row.medium,
        high: row.high,
        flaggedRate: share(row.medium + row.high, row.assessed),
      }))
      const assessed = countries.reduce((sum, entry) => sum + entry.assessed, 0)
      const flagged = countries.reduce((sum, entry) => sum + entry.medium + entry.high, 0)

      /* Only countries with enough payments to mean something are compared. */
      const comparable = countries.filter((entry) => entry.assessed >= 30)
      const ordered = [...comparable].sort((a, b) => a.flaggedRate - b.flaggedRate)
      const gap =
        ordered.length >= 2
          ? {
              lowest: { code: ordered[0].code, name: ordered[0].name, flaggedRate: ordered[0].flaggedRate },
              highest: {
                code: ordered.at(-1).code,
                name: ordered.at(-1).name,
                flaggedRate: ordered.at(-1).flaggedRate,
              },
              points: ordered.at(-1).flaggedRate - ordered[0].flaggedRate,
            }
          : null

      return {
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        engine: ENGINE,
        thresholds: THRESHOLDS,
        inputs: RISK_INPUTS,
        neverUsed: NEVER_USED,
        rules: RULES.map(({ id, label, description, max, inputs }) => ({ id, label, description, max, inputs })),
        explainer: {
          sees: [
            'The names of the rules that fired',
            'What each one saw: counts, and the order amount',
            'The decision',
          ],
          neverSees: ['Buyer name', 'Email address', 'Country', 'Phone number'],
        },
        summary: { assessed, flagged, flaggedRate: share(flagged, assessed), compared: comparable.length },
        gap,
        countries,
      }
    },

    /* Takes one real payment and scores it again as if it came from each country in turn, through the same code that
       scores every payment. The scores come out the same, because country is not an input. */
    async probe(paymentId) {
      const id = paymentId ?? (await admin.sampleForProbe())
      if (!id) return { payment: null, results: [], identical: true, fired: [] }
      const input = await admin.scoringInput(id)
      if (!input) throw notFound('We could not find that payment.')
      const payment = await admin.payment(id)

      const results = []
      let fired = []
      for (const country of await admin.countries()) {
        const scored = await risk.scoreFor({
          ...input,
          at: new Date(input.createdAt).toISOString(),
          countryCode: country.code,
        })
        results.push({ code: country.code, name: country.name, score: scored.score, level: scored.level })
        fired = scored.fired
      }
      const identical = results.every((entry) => entry.score === results[0].score && entry.level === results[0].level)
      return {
        payment: {
          id: payment.id,
          reference: payment.reference,
          country: { code: payment.countryCode, name: payment.countryName },
        },
        results,
        identical,
        fired: fired.map(({ id: ruleId, label, points, fact }) => ({ id: ruleId, label, points, fact })),
      }
    },

    async audit(filters) {
      const { rows, total } = await audit.list(filters)
      return {
        total,
        entries: rows.map((row) => ({
          id: row.id,
          actor: row.actor,
          actorId: row.actorId,
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          data: row.data,
          at: row.createdAt,
        })),
      }
    },
  }
}
