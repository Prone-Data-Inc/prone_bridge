/* The seller copilot. A seller asks a question in plain words. The model reads the seller's own data through tools, one
   round at a time, and answers. It can also PROPOSE a change (turn a method on or off, make or pause a payment link, pay
   out). A proposal is only saved. It happens when the seller presses Confirm, through the same service the dashboard uses,
   and it is written to the audit log either way.
   What keeps this safe: every tool takes the seller from the server, never from the model; every argument is checked; what
   a button says is written by the server; a proposal works once and expires; and the day's token budget caps the spend. */
import { formatUsd } from '#shared/money.js'
import { badRequest, conflict, notFound, unavailable } from '#server/lib/errors.js'
import {
  ACTION_LIFETIME_MS,
  ARGUMENTS,
  MAX_ROUNDS,
  STEP_LABELS,
  TOOLS,
  dollars,
  instructions,
  percent,
  safeName,
} from '#server/lib/copilot.js'
import { createAuditRepository } from '#server/repositories/audit.repository.js'
import { createCopilotRepository } from '#server/repositories/copilot.repository.js'
import { cleanText } from './ai.service.js'

const DAY = 86_400_000
/* A single answer cannot pile up changes for the seller to wade through. */
const MAX_PROPOSALS = 3

export const actionView = (row) => ({
  id: row.id,
  kind: row.kind,
  summary: row.summary,
  status: row.status,
  expiresAt: row.expiresAt,
  result: row.result ?? null,
})

/* A reading tool's answer or a proposal's, as JSON text for the model. */
const asOutput = (value) => JSON.stringify(value)

export function createCopilotService({
  db,
  ai,
  seller,
  match,
  payouts,
  catalogRepository,
  logger,
  now = () => new Date(),
}) {
  const actions = createCopilotRepository({ db })
  const audit = createAuditRepository({ db })

  async function merchantOrFail(slug) {
    const merchant = await catalogRepository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant
  }

  /* ---- Reading tools: the seller's own data, cut down to what an answer needs ---------------------------------- */

  const pair = (metric, unit) => {
    const convert = unit === 'usd' ? dollars : unit === 'pct' ? percent : (value) => value
    return {
      now: convert(metric.value),
      before: convert(metric.previous),
      change_pct: unit === 'pct' || metric.delta == null ? null : percent(metric.delta),
    }
  }

  const readers = {
    async get_overview({ days }, { merchant }) {
      const o = await seller.overview(merchant.slug, days)
      const k = o.kpis
      return {
        period: `last ${days} days, compared with the ${days} days before`,
        volume_usd: pair(k.gross, 'usd'),
        kept_after_fees_usd: pair(k.net, 'usd'),
        paid_sales: pair(k.payments),
        average_order_usd: pair(k.averageOrder, 'usd'),
        success_rate_pct: pair(k.successRate, 'pct'),
        checkout_conversion_pct: pair(k.conversion, 'pct'),
        customers: pair(k.customers),
        refunded_usd: pair(k.refunded, 'usd'),
        top_methods: o.methods
          .slice(0, 4)
          .map((m) => ({ method: m.label, volume_usd: dollars(m.grossUsdCents), sales: m.payments })),
        top_countries: o.countries
          .slice(0, 5)
          .map((c) => ({ country: c.name, code: c.code, volume_usd: dollars(c.grossUsdCents), sales: c.payments })),
        owed_now: { usd: dollars(o.balance.owedUsdCents), sales: o.balance.owedPayments },
        things_worth_a_look: o.attention.map((item) => item.message),
      }
    },

    async get_countries({ days }, { merchant }) {
      const report = await seller.countries(merchant.slug, days)
      return {
        period: `last ${days} days`,
        countries: report.countries.map((c) => ({
          country: c.name,
          code: c.code,
          visitors: c.visits,
          paid_visitors: c.paidVisits,
          conversion_pct: percent(c.conversion),
          visitors_left_at: {
            choosing_country: c.leftAt.country,
            choosing_method: c.leftAt.method,
            paying: c.leftAt.payment,
          },
          methods: c.methods.map((m) => ({
            id: m.id,
            label: m.label,
            on: m.enabled,
            open_to_buyers: m.live,
            health: m.status,
            payments: m.attempts,
            success_rate_pct: m.attempts > 0 ? percent(m.successRate) : null,
          })),
        })),
      }
    },

    async list_payments({ status, country, method, limit }, { merchant }) {
      const found = await seller.payments(
        merchant.slug,
        { status: status ?? undefined, country: country ?? undefined, method: method ?? undefined },
        { limit },
      )
      return {
        matching: found.total,
        shown: found.shown,
        payments: found.payments.map((p) => ({
          reference: p.reference,
          status: p.status,
          amount_usd: dollars(p.amountUsdCents),
          method: p.method.label,
          country: p.country.name,
          course: p.product.title,
          buyer: safeName(p.buyer.name),
          at: p.createdAt,
          why_it_failed: p.failureMessage,
        })),
      }
    },

    async get_customers({ limit }, { merchant }) {
      const found = await seller.customers(merchant.slug, { limit })
      return {
        customers: found.customers.map((c) => ({
          name: safeName(c.name),
          country: c.country.name,
          orders: c.orders,
          spent_usd: dollars(c.spentUsdCents),
          last_order_at: c.lastAt,
        })),
      }
    },

    async get_payouts(_args, { merchant }) {
      const p = await seller.payouts(merchant.slug)
      return {
        owed_now_usd: dollars(p.balance.owedUsdCents),
        owed_sales: p.balance.owedPayments,
        paid_so_far_usd: dollars(p.totals.paidUsdCents),
        on_its_way_usd: dollars(p.totals.onItsWayUsdCents),
        latest: p.payouts.slice(0, 5).map((payout) => ({
          reference: payout.reference,
          status: payout.status,
          amount_usd: dollars(payout.amountUsdCents),
          sales: payout.paymentsCount,
          simulated: payout.simulated,
          created_at: payout.createdAt,
        })),
      }
    },

    async get_links(_args, { merchant }) {
      const { links } = await seller.links(merchant.slug)
      return {
        links: links.map((l) => ({
          code: l.code,
          title: l.title,
          course: l.product.title,
          state: l.state,
          visitors: l.visits,
          sales: l.paid,
          earned_usd: dollars(l.revenueUsdCents),
          sales_limit: l.maxUses,
          ends_at: l.expiresAt,
        })),
      }
    },

    async get_products(_args, { merchant }) {
      const products = await catalogRepository.listProducts(merchant.id)
      return { courses: products.map((p) => ({ slug: p.slug, title: p.title, price_usd: dollars(p.priceUsdCents) })) }
    },

    async get_method_match({ country }, { merchant }) {
      const found = await match.forCountry(merchant.slug, country)
      return {
        country,
        basis: found.basis,
        best_first: found.methods.map((m) => ({
          id: m.id,
          label: m.label,
          estimated_success_pct: percent(m.successRate),
          payments_seen: m.sample,
          health: m.status,
        })),
      }
    },
  }

  /* ---- Propose tools: check the idea against the real data, then save it for the seller to confirm --------------- */

  async function save(merchant, kind, params, summary) {
    const id = await actions.insert({
      merchantId: merchant.id,
      kind,
      params,
      summary,
      expiresAt: new Date(now().getTime() + ACTION_LIFETIME_MS).toISOString(),
    })
    await audit.record({
      actor: 'ai',
      actorId: merchant.slug,
      action: 'copilot.proposed',
      entityType: 'copilot_action',
      entityId: id,
      data: { kind, summary },
    })
    return { id, summary }
  }

  const proposers = {
    async propose_method_change({ country, method, enabled }, { merchant }) {
      const report = await seller.countries(merchant.slug, 30)
      const place = report.countries.find((c) => c.code === country)
      const found = place?.methods.find((m) => m.id === method)
      if (!found) return { error: 'That method is not offered in that country.' }
      if (found.enabled === enabled) return { error: `It is already ${enabled ? 'on' : 'off'}.` }
      if (enabled && !found.platformEnabled) return { error: 'ProneBridge has not opened that method there yet.' }
      return save(
        merchant,
        'method',
        { country, method, enabled },
        `Turn ${enabled ? 'on' : 'off'} ${found.label} in ${place.name}`,
      )
    },

    async propose_create_link({ product, title, max_uses: maxUses, expires_in_days: days }, { merchant }) {
      const products = await catalogRepository.listProducts(merchant.id)
      const found = products.find((p) => p.slug === product)
      if (!found) return { error: 'That course does not exist. Use get_products first.' }
      const name = title || found.title
      const parts = [`Create a payment link for ${found.title}`]
      if (title && title !== found.title) parts[0] += ` called "${title}"`
      if (days) parts.push(`ending in ${days} day${days === 1 ? '' : 's'}`)
      if (maxUses) parts.push(`up to ${maxUses} sale${maxUses === 1 ? '' : 's'}`)
      return save(merchant, 'link_create', { product, title: name, maxUses, expiresInDays: days }, parts.join(', '))
    },

    async propose_link_active({ code, active }, { merchant }) {
      const { links } = await seller.links(merchant.slug)
      const link = links.find((l) => l.code === code)
      if (!link) return { error: 'That link does not exist. Use get_links first.' }
      if (link.active === active) return { error: `It is already ${active ? 'active' : 'paused'}.` }
      return save(
        merchant,
        'link_active',
        { linkId: link.id, code, active },
        `${active ? 'Resume' : 'Pause'} the payment link "${link.title}"`,
      )
    },

    async propose_payout(_args, { merchant }) {
      const p = await seller.payouts(merchant.slug)
      if (p.balance.owedUsdCents <= 0) return { error: 'Nothing is owed right now.' }
      return save(
        merchant,
        'payout',
        {},
        `Pay out ${formatUsd(p.balance.owedUsdCents)} for ${p.balance.owedPayments} paid sale${p.balance.owedPayments === 1 ? '' : 's'}`,
      )
    },
  }

  /* One tool call from the model. Never throws: a problem goes back to the model as an answer, so it can say so. */
  async function runTool(call, context) {
    const schema = ARGUMENTS[call.name]
    const run = readers[call.name] ?? proposers[call.name]
    if (!schema || !run) return { error: 'There is no such tool.' }
    let args
    try {
      args = schema.parse(JSON.parse(call.arguments))
    } catch (error) {
      return {
        error: `Those arguments are not valid: ${error.issues?.[0]?.message ?? 'send JSON in the right shape'}.`,
      }
    }
    if (proposers[call.name] && context.proposed.length >= MAX_PROPOSALS) {
      return { error: 'Too many changes at once. Ask the seller to confirm these first.' }
    }
    try {
      const answer = await run(args, context)
      if (proposers[call.name] && answer.id) context.proposed.push(answer.id)
      return answer.id
        ? {
            saved: true,
            action_id: answer.id,
            summary: answer.summary,
            next: 'Waiting for the seller to confirm in the app.',
          }
        : answer
    } catch (error) {
      logger?.warn('copilot tool failed', { tool: call.name, code: error.code })
      return { error: error.message || 'That did not work.' }
    }
  }

  /* What a confirmed proposal does, through the same services the dashboard uses. */
  const executors = {
    method: (row, merchant) =>
      seller.setMethod(merchant.slug, row.params.country, row.params.method, row.params.enabled, { via: 'copilot' }),
    link_create: (row, merchant) =>
      seller.createLink(merchant.slug, {
        product: row.params.product,
        title: row.params.title,
        maxUses: row.params.maxUses ?? undefined,
        expiresAt: row.params.expiresInDays
          ? new Date(now().getTime() + row.params.expiresInDays * DAY).toISOString()
          : undefined,
      }),
    link_active: (row, merchant) => seller.setLinkActive(merchant.slug, row.params.linkId, row.params.active),
    payout: async (_row, merchant) => {
      const run = await payouts.run(merchant.slug)
      return { payouts: run.payouts.length, skipped: run.skipped }
    },
  }

  /* Why a proposal cannot be decided now. Always throws. */
  async function explainMissing(merchant, id) {
    const row = await actions.find(merchant.id, id)
    if (!row) throw notFound('We could not find that change.')
    if (row.status !== 'pending') throw conflict('That change was already decided.')
    throw badRequest('That change expired. Ask the copilot again.')
  }

  return {
    /* Is the copilot on, what is left of today's budget, and what is waiting for a decision. */
    async status(slug) {
      const merchant = await merchantOrFail(slug)
      const [state, pending] = await Promise.all([ai.status(), actions.pending(merchant.id, now().toISOString())])
      return {
        enabled: state.enabled,
        dailyTokenBudget: state.dailyTokenBudget,
        remainingTokens: state.remainingTokens,
        pending: pending.map(actionView),
      }
    },

    /* messages: the conversation so far, ending with the seller's question. */
    async ask(slug, messages) {
      if (!ai.enabled) throw unavailable('The AI is not connected yet.')
      const merchant = await merchantOrFail(slug)
      const context = { merchant, proposed: [] }
      const input = [
        { role: 'system', content: instructions({ merchant, today: now().toISOString().slice(0, 10) }) },
        ...messages.map(({ role, content }) => ({ role, content })),
      ]
      const steps = []
      let tokens = 0
      let reply = null

      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const result = await ai.run(
          'copilot',
          {
            model: ai.models.agent,
            input,
            tools: TOOLS,
            effort: 'low',
            include: ['reasoning.encrypted_content'],
            maxOutputTokens: 1200,
          },
          { merchantId: merchant.id },
        )
        tokens += result.usage.inputTokens + result.usage.outputTokens
        if (result.calls.length === 0) {
          reply = result.refusal ?? result.text
          break
        }
        input.push(...result.output)
        for (const call of result.calls) {
          steps.push({ tool: call.name, label: STEP_LABELS[call.name] ?? call.name })
          input.push({
            type: 'function_call_output',
            call_id: call.callId,
            output: asOutput(await runTool(call, context)),
          })
        }
      }

      const proposed = await actions.findMany(merchant.id, context.proposed)
      return {
        reply: cleanText(reply || 'I could not finish that. Try a narrower question.'),
        actions: proposed.map(actionView),
        steps: steps.filter((step, index) => steps.findIndex((other) => other.label === step.label) === index),
        tokens,
      }
    },

    /* The seller pressed Confirm. It happens once, only while the proposal is fresh. */
    async confirm(slug, id) {
      const merchant = await merchantOrFail(slug)
      const row = await actions.claim(merchant.id, id, 'confirmed', now().toISOString())
      if (!row) await explainMissing(merchant, id)

      try {
        const result = await executors[row.kind](row, merchant)
        await actions.finish(id, 'confirmed', result)
        await audit.record({
          actor: 'seller',
          actorId: merchant.slug,
          action: 'copilot.confirmed',
          entityType: 'copilot_action',
          entityId: id,
          data: { kind: row.kind, summary: row.summary, via: 'copilot' },
        })
        return { action: actionView({ ...row, result }) }
      } catch (error) {
        await actions.finish(id, 'failed', { message: error.message })
        throw error
      }
    },

    async dismiss(slug, id) {
      const merchant = await merchantOrFail(slug)
      const row = await actions.claim(merchant.id, id, 'dismissed', now().toISOString())
      if (!row) await explainMissing(merchant, id)
      await audit.record({
        actor: 'seller',
        actorId: merchant.slug,
        action: 'copilot.dismissed',
        entityType: 'copilot_action',
        entityId: id,
        data: { kind: row.kind, summary: row.summary },
      })
      return { action: actionView(row) }
    },
  }
}
