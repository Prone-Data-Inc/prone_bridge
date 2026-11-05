/* Made-up answers of the seller API for the dashboard tests, in the shapes the server sends. */

export const merchant = { id: 'm-1', slug: 'pdl', name: 'Prone Data Learning' }

export const sellerPayment = (over = {}) => ({
  id: 'pay-1',
  reference: 'pb_AB12CD34EF56',
  status: 'succeeded',
  failureCode: null,
  failureMessage: null,
  provider: 'simulated',
  simulated: true,
  amountUsdCents: 3900,
  feeUsdCents: 98,
  netUsdCents: 3802,
  displayCurrency: 'XOF',
  displayAmountMinor: 23400,
  method: { id: 'mobile_money', label: 'Mobile money', kind: 'mobile_money' },
  country: { code: 'CI', name: "Côte d'Ivoire" },
  product: { id: 'p-ai', slug: 'ai-for-work', title: 'AI for Work' },
  buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' },
  card: null,
  link: null,
  paidOut: false,
  createdAt: '2026-11-04T10:00:00.000Z',
  completedAt: '2026-11-04T10:00:04.000Z',
  ...over,
})

export const timeline = [
  { type: 'created', label: 'Payment started', detail: null, actor: 'buyer', at: '2026-11-04T10:00:00.000Z' },
  { type: 'succeeded', label: 'Payment received', detail: null, actor: 'system', at: '2026-11-04T10:00:04.000Z' },
]

export const paymentDetail = (over = {}) => ({ payment: sellerPayment(), timeline, ...over })

const metric = (value, previous) => ({ value, previous, delta: previous > 0 ? (value - previous) / previous : null })

export const overview = (over = {}) => ({
  merchant,
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  kpis: {
    gross: metric(1_212_500, 922_200),
    net: metric(1_178_767, 896_000),
    payments: metric(255, 188),
    averageOrder: metric(4754, 4905),
    successRate: metric(0.934, 0.922),
    conversion: metric(0.688, 0.724),
    customers: metric(180, 150),
    refunded: metric(0, 0),
  },
  series: {
    days: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
    gross: [30_000, 42_000, 38_000, 51_000],
    previousGross: [20_000, 25_000, 30_000, 28_000],
    payments: [8, 11, 9, 13],
  },
  methods: [
    { id: 'mobile_money', label: 'Mobile money', grossUsdCents: 714_200, payments: 120 },
    { id: 'bank_transfer', label: 'Bank transfer', grossUsdCents: 166_500, payments: 30 },
    { id: 'card', label: 'Card', grossUsdCents: 161_700, payments: 28 },
    { id: 'paypal', label: 'PayPal', grossUsdCents: 95_800, payments: 17 },
    { id: 'voucher', label: 'Cash voucher', grossUsdCents: 74_300, payments: 12 },
  ],
  countries: [
    { code: 'CI', name: "Côte d'Ivoire", grossUsdCents: 326_400, payments: 70 },
    { code: 'SN', name: 'Senegal', grossUsdCents: 163_400, payments: 33 },
  ],
  balance: { owedUsdCents: 247_625, owedPayments: 54, realOwedUsdCents: 0, realOwedPayments: 0 },
  recent: [
    sellerPayment(),
    sellerPayment({
      id: 'pay-2',
      reference: 'pb_ZZ99YY88XX77',
      status: 'failed',
      buyer: { id: 'b-2', name: 'Kofi Mensah', email: 'kofi@example.com' },
    }),
  ],
  attention: [
    {
      kind: 'method_off',
      level: 'warning',
      section: 'countries',
      message: '8 visitors from Kenya left because Mobile money is off. Turn it on to win them back.',
    },
  ],
  ...over,
})

export const customers = () => ({
  merchant,
  total: 2,
  customers: [
    {
      id: 'b-1',
      name: 'Aminata Koné',
      email: 'aminata.kone@example.com',
      country: { code: 'CI', name: "Côte d'Ivoire" },
      orders: 3,
      spentUsdCents: 11_700,
      refundedUsdCents: 0,
      courses: 3,
      firstAt: '2026-09-13T10:00:00.000Z',
      lastAt: '2026-11-04T10:00:00.000Z',
    },
    {
      id: 'b-2',
      name: 'Kofi Mensah',
      email: 'kofi@example.com',
      country: { code: 'GH', name: 'Ghana' },
      orders: 1,
      spentUsdCents: 3900,
      refundedUsdCents: 0,
      courses: 1,
      firstAt: '2026-10-01T10:00:00.000Z',
      lastAt: '2026-10-01T10:00:00.000Z',
    },
  ],
})

export const customerDetail = () => ({
  customer: customers().customers[0],
  payments: [sellerPayment(), sellerPayment({ id: 'pay-3', reference: 'pb_QQ11WW22EE33', status: 'refunded' })],
  courses: [{ id: 'p-ai', slug: 'ai-for-work', title: 'AI for Work', unlockedAt: '2026-11-04T10:00:04.000Z' }],
})

const method = (id, label, over = {}) => ({
  id,
  kind: id,
  label,
  simulated: !['card', 'paypal'].includes(id),
  enabled: true,
  platformEnabled: true,
  status: 'operational',
  live: true,
  attempts: 10,
  paid: 9,
  successRate: 0.9,
  grossUsdCents: 35_100,
  share: 0.5,
  ...over,
})

export const countries = () => ({
  merchant,
  range: { days: 30, from: '2026-10-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
  countries: [
    {
      code: 'KE',
      name: 'Kenya',
      region: 'East Africa',
      currency: 'KES',
      visits: 20,
      paidVisits: 5,
      conversion: 0.25,
      leftAt: { country: 1, method: 8, payment: 3 },
      payments: 5,
      grossUsdCents: 19_500,
      live: true,
      methods: [
        method('mobile_money', 'Mobile money', { enabled: false, live: false, attempts: 0, paid: 0, grossUsdCents: 0 }),
        method('card', 'Card', { status: 'degraded' }),
        method('voucher', 'Cash voucher', { platformEnabled: false, enabled: false, live: false }),
      ],
    },
    {
      code: 'CI',
      name: "Côte d'Ivoire",
      region: 'West Africa',
      currency: 'XOF',
      visits: 100,
      paidVisits: 67,
      conversion: 0.67,
      leftAt: { country: 2, method: 0, payment: 22 },
      payments: 60,
      grossUsdCents: 326_400,
      live: true,
      methods: [method('mobile_money', 'Mobile money'), method('paypal', 'PayPal')],
    },
    {
      code: 'GN',
      name: 'Guinea',
      region: 'West Africa',
      currency: 'GNF',
      visits: 0,
      paidVisits: 0,
      conversion: 0,
      leftAt: { country: 0, method: 0, payment: 0 },
      payments: 0,
      grossUsdCents: 0,
      live: false,
      methods: [
        method('mobile_money', 'Mobile money', { enabled: false, live: false, attempts: 0, paid: 0, grossUsdCents: 0 }),
      ],
    },
  ],
})

export const payout = (over = {}) => ({
  id: 'po-1',
  reference: 'po_AB12CD34',
  status: 'paid',
  provider: 'simulated',
  simulated: true,
  amountUsdCents: 260_038,
  paymentsCount: 57,
  recipientEmail: 'payouts@pdl.example',
  periodStart: '2026-10-22',
  periodEnd: '2026-10-29',
  failureCode: null,
  createdAt: '2026-10-30T19:01:00.000Z',
  paidAt: '2026-10-31T19:01:00.000Z',
  ...over,
})

export const payouts = (over = {}) => ({
  merchant,
  balance: { owedUsdCents: 247_625, owedPayments: 54, realOwedUsdCents: 0, realOwedPayments: 0 },
  totals: { paidUsdCents: 2_510_791, onItsWayUsdCents: 0, paidCount: 12 },
  paypal: { available: true, payoutAccountSet: false },
  payouts: [
    payout(),
    payout({
      id: 'po-2',
      reference: 'po_ZZ99YY88',
      status: 'processing',
      provider: 'paypal',
      simulated: false,
      amountUsdCents: 7450,
      paymentsCount: 2,
      periodStart: '2026-11-04',
      periodEnd: '2026-11-04',
      paidAt: null,
    }),
  ],
  ...over,
})

export const payoutDetail = (over = {}) => ({
  payout: payout(),
  payments: [
    {
      id: 'pay-1',
      reference: 'pb_AB12CD34EF56',
      buyerName: 'Aminata Koné',
      productTitle: 'AI for Work',
      amountUsdCents: 3900,
      feeUsdCents: 98,
      netUsdCents: 3802,
      createdAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  ...over,
})

export const link = (over = {}) => ({
  id: 'l-1',
  code: '9n2pdmb6',
  title: 'Launch week',
  note: 'Thanks for joining.',
  product: { slug: 'ai-for-work', title: 'AI for Work', priceUsdCents: 3900 },
  maxUses: null,
  expiresAt: null,
  active: true,
  state: 'active',
  visits: 4,
  paid: 1,
  revenueUsdCents: 3900,
  conversion: 0.25,
  createdAt: '2026-11-04T10:00:00.000Z',
  ...over,
})

export const links = (list = [link()]) => ({ merchant, links: list })
