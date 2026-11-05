/* Made-up answers of the admin API for the admin tests, in the shapes the server sends. */
import { sellerPayment } from './sellerData.js'

export const seller = { id: 'm-1', slug: 'pdl', name: 'Prone Data Learning' }

const metric = (value, previous) => ({ value, previous, delta: previous > 0 ? (value - previous) / previous : null })

export const signal = (over = {}) => ({
  id: 'throwaway_email',
  label: 'Throwaway email',
  points: 40,
  fact: 'The email address is from a throwaway mail service.',
  ...over,
})

export const risk = (over = {}) => ({ score: 0, level: 'low', decision: 'allow', enforced: true, ...over })

/* A payment as the admin sees it. */
export const adminPayment = (over = {}) => {
  const base = sellerPayment()
  delete base.link
  return { ...base, merchant: seller, risk: risk(), ...over }
}

export const heldPayment = (over = {}) =>
  adminPayment({
    id: 'pay-held',
    reference: 'pb_HELD00000001',
    status: 'in_review',
    completedAt: null,
    buyer: { id: 'b-9', name: 'Test Buyer', email: 'test.buyer@mailinator.com' },
    risk: risk({ score: 40, level: 'medium', decision: 'review' }),
    ...over,
  })

export const blockedPayment = (over = {}) =>
  adminPayment({
    id: 'pay-blocked',
    reference: 'pb_BLOCK0000001',
    status: 'blocked',
    failureCode: 'safety_check',
    failureMessage: 'A safety check stopped this payment.',
    risk: risk({ score: 100, level: 'high', decision: 'block' }),
    ...over,
  })

export const assessment = (over = {}) => ({
  score: 40,
  level: 'medium',
  decision: 'review',
  enforced: true,
  signals: [signal()],
  explanation: 'The signals suggest a throwaway address was used.',
  explanationSource: 'ai',
  engine: 'rules-1',
  review: null,
  scoredAt: '2026-11-04T10:00:00.000Z',
  ...over,
})

export const overview = (over = {}) => ({
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  kpis: {
    gross: metric(3_240_000, 2_700_000),
    payments: metric(710, 640),
    successRate: metric(0.931, 0.925),
    blocked: metric(6, 4),
    sellers: metric(5, 5),
  },
  blockedUsdCents: 41_400,
  series: {
    days: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
    gross: [100_000, 120_000, 90_000, 150_000],
    blocked: [0, 1, 0, 2],
  },
  risk: { scored: 716, low: 704, medium: 6, high: 6 },
  queue: { waiting: 2, amountUsdCents: 7800, oldestAt: '2026-11-04T12:00:00.000Z' },
  corridors: {
    operational: 39,
    degraded: 1,
    down: 1,
    troubled: [
      {
        countryCode: 'KE',
        countryName: 'Kenya',
        methodId: 'mobile_money',
        methodLabel: 'Mobile money',
        status: 'down',
      },
      { countryCode: 'GH', countryName: 'Ghana', methodId: 'ussd', methodLabel: 'USSD', status: 'degraded' },
    ],
  },
  settlements: { owedUsdCents: 600_000, owedPayments: 140 },
  flagged: [
    { ...blockedPayment(), explanation: 'Blocked. A throwaway email and rapid attempts.' },
    { ...heldPayment(), explanation: 'Held for review. A throwaway email.' },
  ],
  ai: { enabled: true, usedTokens: 120_000, dailyTokenBudget: 600_000 },
  attention: [
    { kind: 'review', level: 'warning', section: 'review', message: '2 payments are waiting for a review.' },
    { kind: 'corridor', level: 'danger', section: 'corridors', message: 'Mobile money in Kenya is down.' },
  ],
  ...over,
})

export const review = (over = {}) => ({
  waiting: 1,
  queue: [
    {
      ...heldPayment(),
      assessment: {
        signals: [signal()],
        explanation: 'The signals suggest a throwaway address was used.',
        explanationSource: 'ai',
      },
    },
  ],
  recent: [
    {
      ...adminPayment({ id: 'pay-done', reference: 'pb_DONE00000001', status: 'processing' }),
      review: { decision: 'approved', note: 'Called the buyer', at: '2026-11-04T11:00:00.000Z' },
      explanation: 'Held for review.',
    },
  ],
  ...over,
})

export const transactions = (
  payments = [adminPayment(), heldPayment(), blockedPayment()],
  total = payments.length,
) => ({
  payments,
  total,
  shown: payments.length,
})

export const transactionDetail = (over = {}) => ({
  payment: heldPayment(),
  timeline: [
    { type: 'created', label: 'Payment started', detail: null, actor: 'buyer', at: '2026-11-04T10:00:00.000Z' },
    {
      type: 'held_for_review',
      label: 'Held for a safety check',
      detail: null,
      actor: 'system',
      at: '2026-11-04T10:00:00.000Z',
    },
  ],
  assessment: assessment(),
  ...over,
})

export const merchants = (over = {}) => ({
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  merchants: [
    {
      id: 'm-1',
      slug: 'pdl',
      name: 'Prone Data Learning',
      tagline: 'Practical courses',
      countryCode: 'US',
      status: 'active',
      products: 6,
      methodsOn: 38,
      paid: 255,
      grossUsdCents: 1_212_500,
      successRate: 0.934,
      blocked: 1,
      inReview: 0,
      owedUsdCents: 247_625,
      joinedAt: '2026-08-06T00:00:00.000Z',
    },
    {
      id: 'm-2',
      slug: 'savane-studio',
      name: 'Savane Studio',
      tagline: 'Design',
      countryCode: 'FR',
      status: 'paused',
      products: 3,
      methodsOn: 30,
      paid: 90,
      grossUsdCents: 220_000,
      successRate: 0.9,
      blocked: 0,
      inReview: 1,
      owedUsdCents: 0,
      joinedAt: '2026-08-06T00:00:00.000Z',
    },
  ],
  ...over,
})

const corridor = (over = {}) => ({
  countryCode: 'CI',
  countryName: "Côte d'Ivoire",
  region: 'West Africa',
  method: { id: 'mobile_money', label: 'Mobile money', kind: 'mobile_money' },
  simulated: true,
  enabled: true,
  status: 'operational',
  sellersOn: 4,
  attempts: 120,
  paid: 110,
  successRate: 0.9167,
  grossUsdCents: 429_000,
  ...over,
})

export const corridors = (over = {}) => ({
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  summary: { operational: 2, degraded: 1, down: 1 },
  corridors: [
    corridor(),
    corridor({
      method: { id: 'voucher', label: 'Cash voucher', kind: 'voucher' },
      attempts: 0,
      paid: 0,
      successRate: 0,
    }),
    corridor({
      countryCode: 'KE',
      countryName: 'Kenya',
      method: { id: 'mobile_money', label: 'Mobile money', kind: 'mobile_money' },
      status: 'down',
      sellersOn: 1,
    }),
    corridor({
      countryCode: 'GH',
      countryName: 'Ghana',
      method: { id: 'ussd', label: 'USSD', kind: 'ussd' },
      status: 'degraded',
    }),
  ],
  ...over,
})

export const settlements = (over = {}) => ({
  totals: {
    paidUsdCents: 2_510_791,
    onItsWayUsdCents: 7450,
    owedUsdCents: 600_000,
    owedPayments: 140,
    failed: 1,
    viaPaypal: 2,
  },
  owed: [
    { slug: 'pdl', name: 'Prone Data Learning', owedUsdCents: 247_625 },
    { slug: 'savane-studio', name: 'Savane Studio', owedUsdCents: 352_375 },
  ],
  payouts: [
    {
      id: 'po-1',
      reference: 'po_AB12CD34',
      status: 'paid',
      provider: 'simulated',
      simulated: true,
      amountUsdCents: 190_000,
      paymentsCount: 40,
      recipientEmail: 'payouts@pdl.example',
      periodStart: '2026-10-22',
      periodEnd: '2026-10-29',
      failureCode: null,
      createdAt: '2026-10-30T00:00:00.000Z',
      paidAt: '2026-10-31T00:00:00.000Z',
      merchant: seller,
    },
    {
      id: 'po-2',
      reference: 'po_ZZ99YY88',
      status: 'processing',
      provider: 'paypal',
      simulated: false,
      amountUsdCents: 7450,
      paymentsCount: 2,
      recipientEmail: 'sb-seller@personal.example.com',
      periodStart: '2026-11-04',
      periodEnd: '2026-11-04',
      failureCode: null,
      createdAt: '2026-11-04T09:00:00.000Z',
      paidAt: null,
      merchant: seller,
    },
  ],
  ...over,
})

export const fairness = (over = {}) => ({
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  engine: 'rules-1',
  thresholds: { medium: 30, high: 60 },
  inputs: [
    {
      id: 'throwawayEmail',
      label: 'Throwaway email',
      note: 'Only whether the address is from a throwaway mail service.',
    },
    { id: 'declinesLastHour', label: 'Card and PayPal declines', note: 'In the last hour.' },
  ],
  neverUsed: ['Country', 'Nationality', 'Ethnicity', 'Name'],
  rules: [
    {
      id: 'throwaway_email',
      label: 'Throwaway email',
      description: 'The email address is from a service that gives out addresses meant to be thrown away.',
      max: 40,
      inputs: ['throwawayEmail'],
    },
    {
      id: 'repeated_declines',
      label: 'Repeated declines',
      description: 'Two or three declines by a card or PayPal in an hour.',
      max: 40,
      inputs: ['declinesLastHour'],
    },
  ],
  explainer: {
    sees: ['The names of the rules that fired', 'The decision'],
    neverSees: ['Buyer name', 'Email address', 'Country', 'Phone number'],
  },
  summary: { assessed: 716, flagged: 12, flaggedRate: 12 / 716, compared: 2 },
  gap: {
    lowest: { code: 'CI', name: "Côte d'Ivoire", flaggedRate: 0.01 },
    highest: { code: 'NG', name: 'Nigeria', flaggedRate: 0.024 },
    points: 0.014,
  },
  countries: [
    {
      code: 'CI',
      name: "Côte d'Ivoire",
      region: 'West Africa',
      assessed: 200,
      averageScore: 1.2,
      medium: 2,
      high: 0,
      flaggedRate: 0.01,
    },
    {
      code: 'NG',
      name: 'Nigeria',
      region: 'West Africa',
      assessed: 250,
      averageScore: 1.9,
      medium: 4,
      high: 2,
      flaggedRate: 0.024,
    },
  ],
  ...over,
})

export const probe = (over = {}) => ({
  payment: { id: 'pay-held', reference: 'pb_HELD00000001', country: { code: 'CI', name: "Côte d'Ivoire" } },
  results: [
    { code: 'CI', name: "Côte d'Ivoire", score: 40, level: 'medium' },
    { code: 'KE', name: 'Kenya', score: 40, level: 'medium' },
    { code: 'NG', name: 'Nigeria', score: 40, level: 'medium' },
  ],
  identical: true,
  fired: [signal()],
  ...over,
})

export const audit = (over = {}) => ({
  total: 2,
  entries: [
    {
      id: 12,
      actor: 'admin',
      actorId: 'admin',
      action: 'corridor.changed',
      entityType: 'corridor',
      entityId: 'KE:mobile_money',
      data: { before: { status: 'operational' }, after: { status: 'down' } },
      at: '2026-11-04T12:00:00.000Z',
    },
    {
      id: 11,
      actor: 'ai',
      actorId: 'pdl',
      action: 'copilot.proposed',
      entityType: 'copilot_action',
      entityId: 'act-1',
      data: { kind: 'method', summary: 'Turn on Mobile money in Kenya' },
      at: '2026-11-04T11:00:00.000Z',
    },
  ],
  ...over,
})
