/* Made-up courses, countries and payments for the buyer tests, in the shapes the API answers with. */

export const courses = [
  {
    id: 'p-ai',
    slug: 'ai-for-work',
    title: 'AI for Work',
    subtitle: 'Put AI to use on real tasks.',
    summary: 'A practical course on using AI at work.',
    category: 'ai',
    level: 'beginner',
    lessons: 20,
    hours: 4.5,
    priceUsdCents: 3900,
    cover: 'green',
  },
  {
    id: 'p-sql',
    slug: 'sql-in-practice',
    title: 'SQL in Practice',
    subtitle: 'Ask your data better questions.',
    summary: 'Write the queries that answer real questions.',
    category: 'data',
    level: 'intermediate',
    lessons: 24,
    hours: 6,
    priceUsdCents: 5900,
    cover: 'blue',
  },
  {
    id: 'p-flow',
    slug: 'workflow-automation',
    title: 'Workflow Automation',
    subtitle: 'Let the boring work run itself.',
    summary: 'Connect your tools and automate the routine.',
    category: 'automation',
    level: 'beginner',
    lessons: 18,
    hours: 4,
    priceUsdCents: 4900,
    cover: 'teal',
  },
]

const method = (id, kind, label, hint, provider = 'simulated') => ({
  id,
  kind,
  label,
  hint,
  provider,
  simulated: provider === 'simulated',
  status: 'up',
  enabled: true,
})

const mobileMoney = method('mobile_money', 'mobile_money', 'Mobile money', 'Approve on your phone')
const voucher = method('voucher', 'voucher', 'Cash voucher', 'Pay cash at an agent')
const bank = method('bank_transfer', 'bank_transfer', 'Bank transfer', 'Pay from your banking app')
const ussd = method('ussd', 'ussd', 'USSD', 'Dial a code on your phone')
const card = method('card', 'card', 'Card', 'Visa and Mastercard', 'paypal')
const paypal = method('paypal', 'paypal', 'PayPal', 'Pay with your PayPal account', 'paypal')

export const countries = [
  {
    code: 'CI',
    name: "Côte d'Ivoire",
    region: 'West Africa',
    currency: 'XOF',
    currencyName: 'West African CFA franc',
    currencySymbol: 'CFA',
    minorUnits: 0,
    priceStep: 100,
    fxPerUsd: 600,
    dialCode: '+225',
    methods: [mobileMoney, voucher, card, paypal],
  },
  {
    code: 'NG',
    name: 'Nigeria',
    region: 'West Africa',
    currency: 'NGN',
    currencyName: 'Nigerian naira',
    currencySymbol: '₦',
    minorUnits: 2,
    priceStep: 1000,
    fxPerUsd: 1500,
    dialCode: '+234',
    methods: [bank, ussd, mobileMoney, card, paypal],
  },
]

/* A payment as the checkout API returns it. */
export const paymentOf = (over = {}) => ({
  id: 'pay-1',
  reference: 'pb_AB12CD34EF56',
  status: 'processing',
  failureCode: null,
  failureMessage: null,
  provider: 'simulated',
  simulated: true,
  amountUsdCents: 3900,
  displayCurrency: 'XOF',
  displayAmountMinor: 23400,
  fxRate: 600,
  method: { id: 'mobile_money', label: 'Mobile money' },
  country: { code: 'CI', name: "Côte d'Ivoire" },
  product: { id: 'p-ai', slug: 'ai-for-work', title: 'AI for Work' },
  buyer: { id: 'buyer-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' },
  createdAt: '2026-11-04T10:00:00.000Z',
  completedAt: null,
  ...over,
})

export const succeededPayment = (over = {}) =>
  paymentOf({ status: 'succeeded', completedAt: '2026-11-04T10:00:04.000Z', ...over })

export const failedPayment = (over = {}) =>
  paymentOf({
    status: 'failed',
    failureCode: 'insufficient_funds',
    failureMessage: 'The balance was too low.',
    completedAt: '2026-11-04T10:00:04.000Z',
    ...over,
  })
