/* Builds the demo data set in memory: ninety days of checkout traffic for five fictional merchants, with their
   payments, sessions, enrollments and weekly payouts. Pure and seeded, so the same inputs always give the same data.
   Everything here is invented. Rows are marked origin 'seed' and provider 'simulated'. */
import {
  COUNTRIES,
  COUNTRY_METHODS,
  DOMINANT,
  FAILURE_CODES,
  MERCHANTS,
  METHODS,
  METHOD_FAILURE,
  METHOD_SECONDS,
  methodWeight,
} from './data.js'
import { feeFor, formatUsd, toLocalMinor } from '#shared/money.js'
import { buyerIdentity } from './names.js'
import { createRng } from './rng.js'

const DAY = 86_400_000
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 7, 8, 8, 8, 7, 7, 7, 7, 8, 9, 10, 10, 9, 7, 4, 2]
const WEEKDAY_FACTOR = [0.7, 1.1, 1.15, 1.15, 1.1, 1.05, 0.85]
const LOCAL = (id) => id !== 'card' && id !== 'paypal'

/* Insert order: parents before children. */
export const SEED_TABLES = [
  'countries',
  'payment_methods',
  'country_methods',
  'merchants',
  'products',
  'merchant_methods',
  'buyers',
  'payouts',
  'payments',
  'payment_events',
  'enrollments',
  'checkout_sessions',
  'notifications',
  'audit_log',
]

/* Share of visitors who leave without paying. Missing the method buyers expect in their country costs the most. */
export function abandonRate(country, enabled) {
  const dominant = DOMINANT[country]
  let rate = 0.24
  if (!enabled.has(dominant)) rate += 0.3
  const missingOthers = COUNTRY_METHODS[country].filter((id) => LOCAL(id) && id !== dominant && !enabled.has(id)).length
  rate += 0.05 * missingOthers
  return Math.min(rate, 0.8)
}

export function buildSeed({ now = new Date(), seed = 'pronebridge-demo', days = 90 } = {}) {
  const rng = createRng(seed)
  const end = now.getTime()
  const start = end - days * DAY
  const iso = (ms) => new Date(ms).toISOString()

  /* Reference data */
  const countries = COUNTRIES.map((c) => ({
    code: c.code,
    name: c.name,
    region: c.region,
    currency: c.currency,
    currency_name: c.currencyName,
    currency_symbol: c.symbol,
    minor_units: c.minorUnits,
    price_step: c.priceStep,
    fx_per_usd: c.fxPerUsd,
    dial_code: c.dialCode,
    sort: c.sort,
  }))
  const paymentMethods = METHODS.map((m) => ({
    id: m.id,
    kind: m.kind,
    label: m.label,
    hint: m.hint,
    provider: m.provider,
    fee_bps: m.feeBps,
    fee_fixed_cents: m.feeFixedCents,
    sort: m.sort,
  }))
  const countryMethods = Object.entries(COUNTRY_METHODS).flatMap(([code, ids]) =>
    ids.map((id, index) => ({ country_code: code, method_id: id, sort: (index + 1) * 10 })),
  )
  const countryByCode = Object.fromEntries(countries.map((c) => [c.code, c]))
  const methodById = Object.fromEntries(paymentMethods.map((m) => [m.id, m]))

  /* Merchants, products and which methods each one has switched on */
  const merchants = []
  const products = []
  const merchantMethods = []
  const configs = MERCHANTS.map((config) => {
    const merchant = {
      id: rng.uuid(),
      slug: config.slug,
      name: config.name,
      tagline: config.tagline,
      country_code: config.countryCode,
      payout_email: `payouts@${config.slug}.example`,
      status: 'active',
      created_at: iso(start - 60 * DAY),
    }
    merchants.push(merchant)
    const items = config.products.map((p) => {
      const row = {
        id: rng.uuid(),
        merchant_id: merchant.id,
        slug: p.slug,
        title: p.title,
        subtitle: p.subtitle,
        summary: p.summary,
        category: p.category,
        level: p.level,
        lessons: p.lessons,
        hours: p.hours,
        price_usd_cents: p.priceCents,
        cover: p.cover,
        published: true,
        created_at: iso(start - 45 * DAY),
      }
      products.push(row)
      return { row, popularity: p.popularity }
    })
    const enabled = new Map(countries.map((c) => [c.code, new Set()]))
    for (const { country_code: code, method_id: id } of countryMethods) {
      const on = !config.off.includes(`${code}:${id}`)
      merchantMethods.push({ merchant_id: merchant.id, country_code: code, method_id: id, enabled: on })
      if (on) enabled.get(code).add(id)
    }
    return { config, merchant, items, enabled }
  })

  /* Traffic */
  const buyers = []
  const buyersByCountry = new Map()
  const owned = new Set()
  const references = new Set()
  const payments = []
  const events = []
  const enrollments = []
  const sessions = []

  const reference = (prefix) => {
    let value
    do value = `${prefix}_${rng.token(12)}`
    while (references.has(value))
    references.add(value)
    return value
  }

  function pickBuyer(code, product, at) {
    const pool = buyersByCountry.get(code) ?? []
    if (pool.length && rng.chance(0.22)) {
      for (let i = 0; i < 5; i++) {
        const buyer = rng.pick(pool)
        if (!owned.has(`${buyer.id}:${product.id}`)) return buyer
      }
    }
    const identity = buyerIdentity(rng, code, buyers.length + 1)
    const buyer = {
      id: rng.uuid(),
      email: identity.email,
      full_name: identity.name,
      country_code: code,
      created_at: iso(at - rng.int(60_000, 600_000)),
    }
    buyers.push(buyer)
    pool.push(buyer)
    buyersByCountry.set(code, pool)
    return buyer
  }

  for (const { config, merchant, items, enabled } of configs) {
    for (let day = 0; day < days; day++) {
      const dayStart = start + day * DAY
      const lambda = config.visitsPerDay * (0.7 + 0.9 * (day / days)) * WEEKDAY_FACTOR[new Date(dayStart).getUTCDay()]
      const visits = Math.max(0, Math.round(lambda + rng.gauss() * Math.sqrt(lambda) * 0.6))

      for (let v = 0; v < visits; v++) {
        const hour = rng.weighted(
          HOUR_WEIGHTS.map((_, h) => h),
          (h) => HOUR_WEIGHTS[h],
        )
        const at = dayStart + hour * 3_600_000 + rng.int(0, 3_599_999)
        if (at > end - 120_000) continue

        const code = rng.weighted(Object.keys(config.countryWeights), (c) => config.countryWeights[c])
        const { row: product } = rng.weighted(items, (item) => item.popularity)
        const offered = enabled.get(code)

        if (rng.chance(abandonRate(code, offered))) {
          const stage =
            !offered.has(DOMINANT[code]) && rng.chance(0.7) ? 'method' : rng.chance(0.2) ? 'country' : 'payment'
          sessions.push({
            id: rng.uuid(),
            merchant_id: merchant.id,
            product_id: product.id,
            buyer_id: null,
            country_code: code,
            outcome: 'abandoned',
            abandon_stage: stage,
            payment_id: null,
            origin: 'seed',
            created_at: iso(at),
            closed_at: iso(Math.min(at + rng.int(20_000, 600_000), end)),
          })
          continue
        }

        const methodId = rng.weighted([...offered], (id) => methodWeight(code, id))
        const method = methodById[methodId]
        const country = countryByCode[code]
        const buyer = pickBuyer(code, product, at)
        const [low, high] = METHOD_SECONDS[methodId]
        const failed = rng.chance(METHOD_FAILURE[methodId])
        const seconds = rng.int(low, high) * (failed ? 1.5 : 1)
        const completed = Math.min(at + Math.round(seconds * 1000), end)
        const refundAt =
          !failed && completed < end - 4 * DAY && rng.chance(0.015)
            ? Math.min(completed + rng.int(1, 5) * DAY, end)
            : null
        const status = failed ? 'failed' : refundAt ? 'refunded' : 'succeeded'
        const amount = product.price_usd_cents
        const fee = feeFor(amount, { feeBps: method.fee_bps, feeFixedCents: method.fee_fixed_cents })
        const display = toLocalMinor(amount, {
          fxPerUsd: country.fx_per_usd,
          minorUnits: country.minor_units,
          priceStep: country.price_step,
        })
        const brand = methodId === 'card' ? (rng.chance(0.7) ? 'visa' : 'mastercard') : null

        const payment = {
          id: rng.uuid(),
          reference: reference('pb'),
          merchant_id: merchant.id,
          product_id: product.id,
          buyer_id: buyer.id,
          method_id: methodId,
          country_code: code,
          amount_usd_cents: amount,
          display_currency: country.currency,
          display_amount_minor: display,
          fx_rate: country.fx_per_usd,
          fee_usd_cents: fee,
          status,
          failure_code: failed ? rng.pick(FAILURE_CODES[methodId]) : null,
          provider: 'simulated',
          card_brand: brand,
          card_last4: brand ? rng.digits(4) : null,
          origin: 'seed',
          created_at: iso(at),
          completed_at: iso(completed),
        }
        payments.push(payment)

        events.push({ payment_id: payment.id, type: 'created', actor: 'buyer', data: {}, created_at: iso(at) })
        if (failed) {
          events.push({
            payment_id: payment.id,
            type: 'failed',
            actor: 'system',
            data: { code: payment.failure_code },
            created_at: iso(completed),
          })
        } else {
          events.push({
            payment_id: payment.id,
            type: 'succeeded',
            actor: 'system',
            data: {},
            created_at: iso(completed),
          })
          if (refundAt)
            events.push({
              payment_id: payment.id,
              type: 'refunded',
              actor: 'seller',
              data: {},
              created_at: iso(refundAt),
            })
          else {
            owned.add(`${buyer.id}:${product.id}`)
            enrollments.push({
              id: rng.uuid(),
              buyer_id: buyer.id,
              product_id: product.id,
              payment_id: payment.id,
              granted_at: iso(completed),
            })
          }
        }

        sessions.push({
          id: rng.uuid(),
          merchant_id: merchant.id,
          product_id: product.id,
          buyer_id: buyer.id,
          country_code: code,
          outcome: failed ? 'abandoned' : 'paid',
          abandon_stage: failed ? 'payment' : null,
          payment_id: payment.id,
          origin: 'seed',
          created_at: iso(at - rng.int(15_000, 90_000)),
          closed_at: iso(completed),
        })
      }
    }
  }

  payments.sort((a, b) => a.created_at.localeCompare(b.created_at))

  /* Weekly payouts: every complete week that ended at least three days ago is paid out, net of fees and refunds. */
  const payouts = []
  const lastWeek = Math.floor((end - 3 * DAY - start) / (7 * DAY)) - 1
  for (const { merchant } of configs) {
    const byWeek = new Map()
    for (const payment of payments) {
      if (payment.merchant_id !== merchant.id || payment.status !== 'succeeded') continue
      const week = Math.floor((Date.parse(payment.completed_at) - start) / (7 * DAY))
      if (week > lastWeek) continue
      if (!byWeek.has(week)) byWeek.set(week, [])
      byWeek.get(week).push(payment)
    }
    for (const [week, group] of [...byWeek].sort((a, b) => a[0] - b[0])) {
      const weekStart = start + week * 7 * DAY
      const weekEnd = weekStart + 7 * DAY
      const payout = {
        id: rng.uuid(),
        reference: reference('po'),
        merchant_id: merchant.id,
        amount_usd_cents: group.reduce((sum, p) => sum + p.amount_usd_cents - p.fee_usd_cents, 0),
        currency: 'USD',
        status: 'paid',
        provider: 'simulated',
        recipient_email: merchant.payout_email,
        payments_count: group.length,
        period_start: iso(weekStart).slice(0, 10),
        period_end: iso(weekEnd - 1).slice(0, 10),
        origin: 'seed',
        created_at: iso(weekEnd + DAY),
        paid_at: iso(weekEnd + 2 * DAY),
      }
      payouts.push(payout)
      for (const payment of group) payment.payout_id = payout.id
    }
  }
  for (const payment of payments) payment.payout_id ??= null

  /* A few notifications so the bells are not empty on first load. */
  const pdl = merchants.find((m) => m.slug === 'pdl')
  const lastPayout = payouts.filter((p) => p.merchant_id === pdl.id).at(-1)
  const notifications = [
    {
      id: rng.uuid(),
      audience: 'seller',
      merchant_id: pdl.id,
      buyer_id: null,
      kind: 'welcome',
      level: 'info',
      title: 'Welcome to ProneBridge',
      body: 'Your checkout is live in 10 countries.',
      payment_id: null,
      read_at: iso(end - 2 * DAY),
      created_at: iso(end - 3 * DAY),
    },
    {
      id: rng.uuid(),
      audience: 'seller',
      merchant_id: pdl.id,
      buyer_id: null,
      kind: 'insight.coverage',
      level: 'warning',
      title: 'Kenya is losing buyers',
      body: 'Mobile money is off for Kenya. Turn it on to win them back.',
      payment_id: null,
      read_at: null,
      created_at: iso(end - 6 * 3_600_000),
    },
    ...(lastPayout
      ? [
          {
            id: rng.uuid(),
            audience: 'seller',
            merchant_id: pdl.id,
            buyer_id: null,
            kind: 'payout.paid',
            level: 'success',
            title: 'Payout sent',
            body: `${formatUsd(lastPayout.amount_usd_cents)} is on its way to you.`,
            payment_id: null,
            read_at: null,
            created_at: lastPayout.paid_at,
          },
        ]
      : []),
    {
      id: rng.uuid(),
      audience: 'admin',
      merchant_id: null,
      buyer_id: null,
      kind: 'corridors.ok',
      level: 'info',
      title: 'Corridors are healthy',
      body: 'All payment methods are operating normally.',
      payment_id: null,
      read_at: null,
      created_at: iso(end - 3_600_000),
    },
  ]

  const auditLog = [
    {
      actor: 'system',
      actor_id: null,
      action: 'demo.seeded',
      entity_type: null,
      entity_id: null,
      data: { seed, days },
      created_at: iso(end),
    },
  ]

  return {
    countries,
    payment_methods: paymentMethods,
    country_methods: countryMethods,
    merchants,
    products,
    merchant_methods: merchantMethods,
    buyers,
    payouts,
    payments,
    payment_events: events,
    enrollments,
    checkout_sessions: sessions,
    notifications,
    audit_log: auditLog,
  }
}
