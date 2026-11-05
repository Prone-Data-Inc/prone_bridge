/* The risk rules. A payment is scored from what the buyer DID, never from who or where they are.

   The engine takes a closed list of inputs (RISK_INPUTS). Anything else is refused, loudly. A country, a nationality, an
   ethnicity, a name, a language or a phone number cannot reach a score, now or by mistake later: scoreRisk() throws, and a
   test fails the build.

   Rules add points. 0 to 29 is low (the payment goes ahead), 30 to 59 is medium (a person reviews it before any money
   moves), 60 and above is high (blocked at once). The rules decide. The AI only explains what they found. */

export const ENGINE = 'rules-1'
export const THRESHOLDS = Object.freeze({ medium: 30, high: 60 })

/* Mail services that hand out addresses meant to be thrown away. */
export const THROWAWAY_DOMAINS = Object.freeze([
  '10minutemail.com',
  'burnermail.io',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'moakt.com',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'tempmail.com',
  'throwawaymail.com',
  'tmpmail.org',
  'trashmail.com',
  'yopmail.com',
])

/* Everything a score may depend on. This list is what the Fairness page shows, so it cannot drift from the code. */
export const RISK_INPUTS = Object.freeze([
  {
    id: 'throwawayEmail',
    label: 'Throwaway email',
    note: 'Only whether the address is from a throwaway mail service. The name before the @ is not read.',
  },
  { id: 'amountUsdCents', label: 'Order amount', note: 'The course price in US dollars.' },
  { id: 'priorPaid', label: 'Earlier paid orders', note: 'How many this buyer has already paid.' },
  { id: 'priorRefunds', label: 'Earlier refunds', note: 'How many payments by this buyer were refunded.' },
  {
    id: 'declinesLastHour',
    label: 'Card and PayPal declines',
    note: 'In the last hour. A low balance on a local method never counts.',
  },
  { id: 'attemptsLast10m', label: 'Attempts in 10 minutes', note: 'Other payments started by this buyer just before.' },
  {
    id: 'methodsLastHour',
    label: 'Methods tried',
    note: 'Different payment methods tried in the last hour, this one included.',
  },
  {
    id: 'othersToSellerLast2m',
    label: 'Seller burst',
    note: 'Payments to the same seller by other buyers in the last 2 minutes.',
  },
  { id: 'blockedLast24h', label: 'Recent block', note: 'Payments from this buyer blocked in the last 24 hours.' },
])

const INPUT_IDS = new Set(RISK_INPUTS.map((input) => input.id))

/* What the engine promises never to read. Shown on the Fairness page. */
export const NEVER_USED = Object.freeze([
  'Country',
  'Nationality',
  'Ethnicity',
  'Name',
  'Language',
  'Phone number',
  'Currency',
  'Payment method country',
])

/* Words that must never be the name of a score input. A check next to INPUT_IDS, so a careless addition fails at once. */
const FORBIDDEN = /country|nation|ethnic|race|name|language|locale|phone|currency|region|city|continent|origin|religio/i

const money = (cents) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const times = (count, what) => `${count} ${what}${count === 1 ? '' : 's'}`

/* Each rule: how many points for these signals (0 when it does not fire), and a sentence saying what it saw. */
export const RULES = Object.freeze([
  {
    id: 'throwaway_email',
    label: 'Throwaway email',
    description: 'The email address is from a service that gives out addresses meant to be thrown away.',
    inputs: ['throwawayEmail'],
    max: 40,
    points: (s) => (s.throwawayEmail ? 40 : 0),
    fact: () => 'The email address is from a throwaway mail service.',
  },
  {
    id: 'repeated_declines',
    label: 'Repeated declines',
    description: 'Two or three declines by a card or PayPal in an hour, the pattern of someone testing stolen cards.',
    inputs: ['declinesLastHour'],
    max: 40,
    points: (s) => (s.declinesLastHour >= 3 ? 40 : s.declinesLastHour === 2 ? 25 : 0),
    fact: (s) => `${times(s.declinesLastHour, 'card or PayPal decline')} in the last hour.`,
  },
  {
    id: 'rapid_attempts',
    label: 'Rapid attempts',
    description: 'Three or more payments started in ten minutes.',
    inputs: ['attemptsLast10m'],
    max: 20,
    points: (s) => (s.attemptsLast10m >= 3 ? 20 : 0),
    fact: (s) => `${times(s.attemptsLast10m, 'other attempt')} in the last 10 minutes.`,
  },
  {
    id: 'many_methods',
    label: 'Many methods',
    description: 'Three or more different payment methods tried in an hour.',
    inputs: ['methodsLastHour'],
    max: 15,
    points: (s) => (s.methodsLastHour >= 3 ? 15 : 0),
    fact: (s) => `${s.methodsLastHour} different payment methods tried in the last hour.`,
  },
  {
    id: 'seller_burst',
    label: 'Burst on one seller',
    description:
      'Fifteen or more payments to the same seller by other buyers in two minutes, as a bot would. A busy launch alone never holds anyone: this only adds to other signals.',
    inputs: ['othersToSellerLast2m'],
    max: 15,
    points: (s) => (s.othersToSellerLast2m >= 15 ? 15 : 0),
    fact: (s) => `${times(s.othersToSellerLast2m, 'payment')} to this seller from other buyers in the last 2 minutes.`,
  },
  {
    id: 'big_first_order',
    label: 'Big first order',
    description: 'A first order of $80 or more.',
    inputs: ['priorPaid', 'amountUsdCents'],
    max: 10,
    points: (s) => (s.priorPaid === 0 && s.amountUsdCents >= 8000 ? 10 : 0),
    fact: (s) => `A first paid order of ${money(s.amountUsdCents)}.`,
  },
  {
    id: 'past_refund',
    label: 'Past refund',
    description: 'An earlier payment from this buyer was refunded.',
    inputs: ['priorRefunds'],
    max: 15,
    points: (s) => (s.priorRefunds >= 1 ? 15 : 0),
    fact: (s) =>
      `${times(s.priorRefunds, 'earlier payment')} from this buyer ${s.priorRefunds === 1 ? 'was' : 'were'} refunded.`,
  },
  {
    id: 'after_block',
    label: 'Retry after a block',
    description: 'A payment from this buyer was blocked in the last 24 hours.',
    inputs: ['blockedLast24h'],
    max: 30,
    points: (s) => (s.blockedLast24h >= 1 ? 30 : 0),
    fact: (s) =>
      `${times(s.blockedLast24h, 'payment')} from this buyer ${s.blockedLast24h === 1 ? 'was' : 'were'} blocked in the last 24 hours.`,
  },
])

export const levelOf = (score) => (score >= THRESHOLDS.high ? 'high' : score >= THRESHOLDS.medium ? 'medium' : 'low')
export const DECISIONS = Object.freeze({ low: 'allow', medium: 'review', high: 'block' })

/* Is this address from a throwaway service? Only the part after the @ is looked at. */
export function isThrowawayEmail(email = '') {
  const domain = String(email).trim().toLowerCase().split('@').at(-1)
  return THROWAWAY_DOMAINS.some((listed) => domain === listed || domain.endsWith(`.${listed}`))
}

/* signals: exactly the inputs in RISK_INPUTS. Answers { score, level, decision, fired, engine }; fired lists each rule
   that added points with what it saw. */
export function scoreRisk(signals) {
  for (const key of Object.keys(signals)) {
    if (FORBIDDEN.test(key) || !INPUT_IDS.has(key)) {
      throw new TypeError(`"${key}" is not a risk input. Scores never depend on who or where a buyer is.`)
    }
  }
  const fired = []
  let score = 0
  for (const rule of RULES) {
    const points = rule.points(signals)
    if (points > 0) {
      fired.push({ id: rule.id, label: rule.label, points, fact: rule.fact(signals) })
      score += points
    }
  }
  score = Math.min(100, score)
  const level = levelOf(score)
  return { score, level, decision: DECISIONS[level], fired, engine: ENGINE }
}

/* The rules' own explanation, in plain words. Used as it is when the AI is off, and as the base the AI rewrites. */
export function rulesExplanation({ level, fired }) {
  if (fired.length === 0) return 'No risk signals fired.'
  const facts = fired.map((entry) => entry.fact).join(' ')
  if (level === 'high') return `Blocked. ${facts}`
  if (level === 'medium') return `Held for review. ${facts}`
  return `Low risk. ${facts}`
}
