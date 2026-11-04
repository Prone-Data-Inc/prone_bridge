/* Made-up numbers for the design system gallery only. Nothing here is real data. A tiny seeded generator keeps it the
   same on every visit. */
const generator = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const COUNTRIES = [
  ['CI', "Côte d'Ivoire"],
  ['SN', 'Senegal'],
  ['NG', 'Nigeria'],
  ['GH', 'Ghana'],
  ['KE', 'Kenya'],
  ['ZA', 'South Africa'],
]

const METHODS = [
  ['Mobile money', true],
  ['Card', false],
  ['PayPal', false],
  ['Bank transfer', true],
]

const STATUSES = [
  'succeeded',
  'succeeded',
  'succeeded',
  'succeeded',
  'succeeded',
  'processing',
  'failed',
  'in_review',
  'refunded',
  'blocked',
]
const FIRST = ['Aminata', 'Kofi', 'Chidi', 'Wanjiru', 'Thabo', 'Fatou', 'Ama', 'Tunde']
const LAST = ['Diallo', 'Mensah', 'Okafor', 'Kamau', 'Nkosi', 'Sow', 'Boateng', 'Bello']

export const DAYS = Array.from({ length: 30 }, (_, i) => `${i + 1}`)

export function sampleSeries() {
  const next = generator(7)
  let level = 2400
  const volume = DAYS.map((_, i) => {
    level += (next() - 0.38) * 260 + i * 6
    return Math.round(level)
  })
  const previous = volume.map((value) => Math.round(value * (0.78 + next() * 0.1)))
  const payments = volume.map((value) => Math.round(value / 41 + next() * 6))
  return { volume, previous, payments }
}

export function samplePayments(count = 60) {
  const next = generator(42)
  const day = 86_400_000
  return Array.from({ length: count }, (_, i) => {
    const [countryCode, country] = COUNTRIES[Math.floor(next() * COUNTRIES.length)]
    const [method, simulated] = METHODS[Math.floor(next() * METHODS.length)]
    return {
      id: `sample-${i}`,
      reference: `pb_${(900_000 + i * 7919).toString(36).toUpperCase().padStart(6, '0')}`,
      date: new Date(Date.UTC(2026, 10, 4) - Math.floor(next() * 30 * day)),
      customer: `${FIRST[Math.floor(next() * FIRST.length)]} ${LAST[Math.floor(next() * LAST.length)]}`,
      country,
      countryCode,
      method,
      simulated,
      amount: [2900, 3900, 4900, 5900, 8900, 9900][Math.floor(next() * 6)],
      status: STATUSES[Math.floor(next() * STATUSES.length)],
    }
  })
}

export const METHOD_MIX = [
  { label: 'Mobile money', value: 5120 },
  { label: 'Card', value: 2210 },
  { label: 'Bank transfer', value: 1340 },
  { label: 'PayPal', value: 640 },
]

export const COUNTRY_RANKING = [
  { label: "Côte d'Ivoire", value: 3140 },
  { label: 'Nigeria', value: 2480 },
  { label: 'Senegal', value: 1950 },
  { label: 'Ghana', value: 1420 },
  { label: 'Kenya', value: 980 },
]
