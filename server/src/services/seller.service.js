/* The seller's view of their own business: overview, payments, customers, countries and methods, payouts and payment
   links. It reads what the checkout and settlement wrote, adds the arithmetic (periods, changes, rates) and turns rows
   into the shapes the dashboard draws. The seller can change two things here: which methods are on in which country,
   and their payment links. Everything else is read only. */
import { failureMessage } from '#shared/failures.js'
import { badRequest, conflict, notFound } from '#server/lib/errors.js'
import { linkCode } from '#server/lib/ids.js'
import { linkState } from '#server/lib/links.js'
import { createSellerRepository } from '#server/repositories/seller.repository.js'
import { payoutView } from './payout.service.js'

const DAY = 86_400_000

/* A period of whole UTC days ending with today: [from, to). The one before it, as long, is what a change is measured against. */
export function periodOf(days, now = new Date()) {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const from = new Date(to.getTime() - days * DAY)
  return { days, from, to, previousFrom: new Date(from.getTime() - days * DAY) }
}

/* How much a number moved, as a fraction. Nothing to compare with gives null. */
const change = (value, previous) => (previous > 0 ? (value - previous) / previous : null)
const metric = (value, previous) => ({ value, previous, delta: change(value, previous) })
const share = (part, whole) => (whole > 0 ? part / whole : 0)

/* What a payment shows a seller. PayPal's ids stay out. */
export function sellerPayment(row) {
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
    buyer: { id: row.buyerId, name: row.buyerName, email: row.buyerEmail },
    card: row.cardLast4 ? { brand: row.cardBrand, last4: row.cardLast4 } : null,
    link: row.linkTitle ? { title: row.linkTitle, code: row.linkCode } : null,
    paidOut: Boolean(row.payoutId),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }
}

const TIMELINE = {
  created: 'Payment started',
  order_created: 'PayPal order made',
  capture_pending: 'PayPal is confirming',
  succeeded: 'Payment received',
  failed: 'Payment failed',
  refunded: 'Payment refunded',
  amount_mismatch: 'Amount did not match',
  held_for_review: 'Held for a safety check',
  blocked: 'Blocked by a safety check',
  review_approved: 'Safety check passed',
  review_rejected: 'Safety check failed',
}

const sentence = (type) => type.charAt(0).toUpperCase() + type.slice(1).replaceAll('_', ' ')

/* A payment's events, in words. Only the parts a seller can use are kept: never an id or an amount from PayPal, and never
   the score or the rules behind a safety check. */
export function timelineOf(events) {
  return events.map((event) => {
    const code = event.data?.code
    return {
      type: event.type,
      label: TIMELINE[event.type] ?? sentence(event.type),
      detail: code ? failureMessage(code) : null,
      actor: event.actor,
      at: event.createdAt,
    }
  })
}

export function linkView(row, now = new Date()) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    note: row.note,
    product: { slug: row.productSlug, title: row.productTitle, priceUsdCents: row.priceUsdCents },
    maxUses: row.maxUses,
    expiresAt: row.expiresAt,
    active: row.active,
    state: linkState(row, now),
    visits: row.visits,
    paid: row.paid,
    revenueUsdCents: row.revenue,
    conversion: share(row.paid, row.visits),
    createdAt: row.createdAt,
  }
}

export function createSellerService({ db, catalogRepository, paypal, env, now = () => new Date() }) {
  const sellers = createSellerRepository({ db })

  async function merchantOrFail(slug) {
    const merchant = await catalogRepository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant
  }

  const publicMerchant = (merchant) => ({ id: merchant.id, slug: merchant.slug, name: merchant.name })

  /* Countries with their methods, how each did, and where the visitors who did not pay gave up. */
  async function countryReport(merchant, period) {
    const [catalog, visits, payments] = await Promise.all([
      sellers.catalog(merchant.id),
      sellers.countryVisits(merchant.id, period.from, period.to),
      sellers.countryMethodPayments(merchant.id, period.from, period.to),
    ])
    const visitsBy = new Map(visits.map((row) => [row.countryCode, row]))
    const paymentsBy = new Map(payments.map((row) => [`${row.countryCode}:${row.methodId}`, row]))

    const countries = []
    for (const row of catalog) {
      let country = countries.find((entry) => entry.code === row.code)
      if (!country) {
        const seen = visitsBy.get(row.code)
        country = {
          code: row.code,
          name: row.name,
          region: row.region,
          currency: row.currency,
          visits: seen?.visits ?? 0,
          paidVisits: seen?.paid ?? 0,
          conversion: share(seen?.paid ?? 0, seen?.visits ?? 0),
          leftAt: {
            country: seen?.leftAtCountry ?? 0,
            method: seen?.leftAtMethod ?? 0,
            payment: seen?.leftAtPayment ?? 0,
          },
          payments: 0,
          grossUsdCents: 0,
          methods: [],
        }
        countries.push(country)
      }
      const done = paymentsBy.get(`${row.code}:${row.methodId}`)
      const enabled = Boolean(row.merchantEnabled)
      country.methods.push({
        id: row.methodId,
        kind: row.kind,
        label: row.label,
        simulated: row.provider === 'simulated',
        enabled,
        platformEnabled: Boolean(row.platformEnabled),
        status: row.corridorStatus,
        live: enabled && row.platformEnabled && row.corridorStatus !== 'down',
        attempts: done?.attempts ?? 0,
        paid: done?.paid ?? 0,
        successRate: share(done?.paid ?? 0, done?.finished ?? 0),
        grossUsdCents: done?.gross ?? 0,
      })
      country.payments += done?.paid ?? 0
      country.grossUsdCents += done?.gross ?? 0
    }
    for (const country of countries) {
      country.live = country.methods.some((method) => method.live)
      for (const method of country.methods) method.share = share(method.grossUsdCents, country.grossUsdCents)
    }
    return countries
  }

  /* A few things worth a look, in plain words. */
  function attentionFrom(countries, balance, lastPayout, at) {
    const items = []
    for (const country of countries) {
      const off = country.methods.find(
        (method) => method.platformEnabled && !method.enabled && method.status !== 'down',
      )
      if (off && country.visits >= 8 && country.leftAt.method >= 4 && country.leftAt.method / country.visits >= 0.2) {
        items.push({
          kind: 'method_off',
          level: 'warning',
          section: 'countries',
          message: `${country.leftAt.method} visitors from ${country.name} left because ${off.label} is off. Turn it on to win them back.`,
        })
      }
      const slow = country.methods.find(
        (method) => method.enabled && method.status !== 'operational' && method.attempts > 0,
      )
      if (slow) {
        items.push({
          kind: 'corridor',
          level: slow.status === 'down' ? 'danger' : 'warning',
          section: 'countries',
          message: `${slow.label} in ${country.name} is ${slow.status}. Payments may be slow or fail.`,
        })
      }
    }
    const waited = lastPayout ? at.getTime() - new Date(lastPayout.createdAt).getTime() : Infinity
    if (balance.owed > 0 && waited > 7 * DAY) {
      items.push({
        kind: 'payout',
        level: 'info',
        section: 'payouts',
        message: `${balance.payments} paid sales are waiting for a payout.`,
      })
    }
    return items.slice(0, 4)
  }

  return {
    async overview(slug, days) {
      const merchant = await merchantOrFail(slug)
      const period = periodOf(days, now())
      const before = { from: period.previousFrom, to: period.from }

      const [
        totals,
        previous,
        visits,
        previousVisits,
        daily,
        previousDaily,
        methods,
        byCountry,
        balance,
        recent,
        payouts,
        countries,
      ] = await Promise.all([
        sellers.totals(merchant.id, period.from, period.to),
        sellers.totals(merchant.id, before.from, before.to),
        sellers.visits(merchant.id, period.from, period.to),
        sellers.visits(merchant.id, before.from, before.to),
        sellers.daily(merchant.id, period.from, period.to),
        sellers.daily(merchant.id, before.from, before.to),
        sellers.byMethod(merchant.id, period.from, period.to),
        sellers.byCountry(merchant.id, period.from, period.to),
        sellers.balance(merchant.id),
        sellers.payments(merchant.id, {}, { limit: 6 }),
        sellers.payouts(merchant.id, 1),
        countryReport(merchant, period),
      ])

      const net = (t) => t.gross - t.fees
      const average = (t) => (t.paid > 0 ? Math.round(t.gross / t.paid) : 0)
      const rate = (t) => share(t.paid, t.finished)

      return {
        merchant: publicMerchant(merchant),
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        kpis: {
          gross: metric(totals.gross, previous.gross),
          net: metric(net(totals), net(previous)),
          payments: metric(totals.paid, previous.paid),
          averageOrder: metric(average(totals), average(previous)),
          successRate: metric(rate(totals), rate(previous)),
          conversion: metric(share(visits.paid, visits.visits), share(previousVisits.paid, previousVisits.visits)),
          customers: metric(totals.customers, previous.customers),
          refunded: metric(totals.refunded, previous.refunded),
        },
        series: {
          days: daily.map((entry) => entry.day),
          gross: daily.map((entry) => entry.gross),
          previousGross: previousDaily.map((entry) => entry.gross),
          payments: daily.map((entry) => entry.payments),
        },
        methods: methods.map((entry) => ({
          id: entry.id,
          label: entry.label,
          grossUsdCents: entry.gross,
          payments: entry.payments,
        })),
        countries: byCountry.map((entry) => ({
          code: entry.code,
          name: entry.name,
          grossUsdCents: entry.gross,
          payments: entry.payments,
        })),
        balance: {
          owedUsdCents: balance.owed,
          owedPayments: balance.payments,
          realOwedUsdCents: balance.realOwed,
          realOwedPayments: balance.realPayments,
        },
        recent: recent.rows.map(sellerPayment),
        attention: attentionFrom(countries, balance, payouts[0], now()),
      }
    },

    async payments(slug, filters, options) {
      const merchant = await merchantOrFail(slug)
      const { rows, total } = await sellers.payments(merchant.id, filters, options)
      return { merchant: publicMerchant(merchant), payments: rows.map(sellerPayment), total, shown: rows.length }
    },

    async payment(slug, id) {
      const merchant = await merchantOrFail(slug)
      const row = await sellers.payment(merchant.id, id)
      if (!row) throw notFound('We could not find that payment.')
      return { payment: sellerPayment(row), timeline: timelineOf(await sellers.paymentEvents(id)) }
    },

    async customers(slug, options) {
      const merchant = await merchantOrFail(slug)
      const rows = await sellers.customers(merchant.id, options)
      return {
        merchant: publicMerchant(merchant),
        customers: rows.map(customerView),
        total: rows.length,
      }
    },

    async customer(slug, id) {
      const merchant = await merchantOrFail(slug)
      const row = await sellers.customer(merchant.id, id)
      if (!row) throw notFound('We could not find that customer.')
      const [payments, courses] = await Promise.all([
        sellers.customerPayments(merchant.id, id),
        sellers.customerCourses(merchant.id, id),
      ])
      return {
        customer: customerView(row),
        payments: payments.map(sellerPayment),
        courses: courses.map((course) => ({
          id: course.id,
          slug: course.slug,
          title: course.title,
          unlockedAt: course.grantedAt,
        })),
      }
    },

    async countries(slug, days) {
      const merchant = await merchantOrFail(slug)
      const period = periodOf(days, now())
      return {
        merchant: publicMerchant(merchant),
        range: { days, from: period.from.toISOString(), to: period.to.toISOString() },
        countries: await countryReport(merchant, period),
      }
    },

    /* Switch a payment method on or off in a country. Off means buyers there stop seeing it at checkout. */
    /* via says where the request came from when it was not the page itself (the copilot, after the seller confirmed). */
    async setMethod(slug, countryCode, methodId, enabled, { via } = {}) {
      const merchant = await merchantOrFail(slug)
      const row = await sellers.methodRow(countryCode, methodId)
      if (!row) throw notFound('That method is not offered in that country.')
      if (enabled && !row.enabled) throw conflict('ProneBridge has not opened that method in that country yet.')
      await sellers.setMethod(merchant.id, countryCode, methodId, enabled)
      await sellers.audit({
        actorId: merchant.slug,
        action: enabled ? 'method.enabled' : 'method.disabled',
        entityType: 'merchant_method',
        entityId: `${countryCode}:${methodId}`,
        data: via ? { country: countryCode, method: methodId, via } : { country: countryCode, method: methodId },
      })
      return { countryCode, methodId, enabled }
    },

    async payouts(slug) {
      const merchant = await merchantOrFail(slug)
      const [rows, balance, totals] = await Promise.all([
        sellers.payouts(merchant.id),
        sellers.balance(merchant.id),
        sellers.payoutTotals(merchant.id),
      ])
      return {
        merchant: publicMerchant(merchant),
        balance: {
          owedUsdCents: balance.owed,
          owedPayments: balance.payments,
          realOwedUsdCents: balance.realOwed,
          realOwedPayments: balance.realPayments,
        },
        totals: { paidUsdCents: totals.paid, onItsWayUsdCents: totals.onItsWay, paidCount: totals.paidCount },
        paypal: { available: paypal.enabled, payoutAccountSet: Boolean(env.paypal.payoutEmail) },
        payouts: rows.map(payoutView),
      }
    },

    async payout(slug, id) {
      const merchant = await merchantOrFail(slug)
      const row = await sellers.payout(merchant.id, id)
      if (!row) throw notFound('We could not find that payout.')
      const covered = await sellers.payoutPayments(id)
      return {
        payout: payoutView(row),
        payments: covered.map((entry) => ({
          id: entry.id,
          reference: entry.reference,
          buyerName: entry.buyerName,
          productTitle: entry.productTitle,
          amountUsdCents: entry.amountUsdCents,
          feeUsdCents: entry.feeUsdCents,
          netUsdCents: entry.netUsdCents,
          createdAt: entry.createdAt,
        })),
      }
    },

    async links(slug) {
      const merchant = await merchantOrFail(slug)
      const rows = await sellers.links(merchant.id)
      return { merchant: publicMerchant(merchant), links: rows.map((row) => linkView(row, now())) }
    },

    async createLink(slug, { product, title, note, maxUses, expiresAt }) {
      const merchant = await merchantOrFail(slug)
      const found = await sellers.findProduct(merchant.id, product)
      if (!found) throw notFound('That course is not available.')
      if (expiresAt) {
        const at = new Date(expiresAt).getTime()
        if (at <= now().getTime()) throw badRequest('Choose an end date in the future.')
        if (at > now().getTime() + 366 * DAY) throw badRequest('A link can last at most a year.')
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = await sellers.insertLink({
          code: linkCode(),
          merchantId: merchant.id,
          productId: found.id,
          title: title || found.title,
          note,
          maxUses,
          expiresAt,
        })
        if (id) return { link: linkView(await sellers.link(merchant.id, id), now()) }
      }
      throw conflict('We could not make a link just now. Try again.')
    },

    async setLinkActive(slug, id, active) {
      const merchant = await merchantOrFail(slug)
      if (!(await sellers.setLinkActive(merchant.id, id, active))) throw notFound('We could not find that link.')
      return { link: linkView(await sellers.link(merchant.id, id), now()) }
    },
  }
}

const customerView = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  country: { code: row.countryCode, name: row.countryName },
  orders: row.orders,
  spentUsdCents: row.spent,
  refundedUsdCents: row.refunded,
  courses: row.courses,
  firstAt: row.firstAt,
  lastAt: row.lastAt,
})
