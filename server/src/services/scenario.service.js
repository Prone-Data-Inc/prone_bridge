/* The demo director: one-click scenarios, and a reset.

   Every scenario goes through the real pipeline: the same checkout, the same simulator, the same risk rules, the same
   notifications and the same admin controls a person would use. Nothing is written to the tables behind their back. What a
   scenario reports is read back from the database after it ran, so the screen says what really happened.

   Reset wipes everything made since the seed and writes a fresh seed dated today, since the demo history is always the 90
   days up to the day it is written. It keeps the AI usage of the day, so a reset is no way to get a new budget. */
import { randomInt, randomUUID } from 'node:crypto'
import { formatUsd } from '#shared/money.js'
import { buildSeed } from '#server/db/seed/build.js'
import { CLEAR_SQL, writeSeed } from '#server/db/seed/apply.js'
import { buyerIdentity } from '#server/db/seed/names.js'
import { createRng } from '#server/db/seed/rng.js'
import { conflict, notFound, tooManyRequests } from '#server/lib/errors.js'
import { shortName } from '#server/lib/ids.js'
import { createAuditRepository } from '#server/repositories/audit.repository.js'
import { createDemoRepository } from '#server/repositories/demo.repository.js'

const MERCHANT = 'pdl'
/* Scenarios that add to the review queue stop here, so the queue never becomes a wall. */
const QUEUE_LIMIT = 12
const RUSH = 18
const ATTEMPTS = 4
const RESET_COOLDOWN_MS = 60_000
/* Course prices below this never trip the "big first order" rule, so a normal sale stays normal. */
const ORDINARY_CENTS = 8000

export const SCENARIOS = [
  {
    id: 'sale',
    title: 'A sale',
    blurb: 'A buyer pays with a local method. The seller sees a new sale and the buyer gets a receipt.',
    watch: [
      { tab: 'seller', section: 'payments', label: 'Seller: Payments' },
      { tab: 'seller', section: 'home', label: 'Seller: Overview' },
    ],
  },
  {
    id: 'failure',
    title: 'A payment that fails',
    blurb: 'The buyer is declined. They get a plain message, and the seller sees what went wrong.',
    watch: [{ tab: 'seller', section: 'payments', label: 'Seller: Payments' }],
  },
  {
    id: 'rush',
    title: 'Launch rush',
    blurb: `${RUSH} buyers pay within seconds. The rules notice the burst, and a busy launch alone never holds anyone.`,
    watch: [
      { tab: 'seller', section: 'home', label: 'Seller: Overview' },
      { tab: 'admin', section: 'overview', label: 'Admin: Overview' },
    ],
  },
  {
    id: 'suspicious',
    title: 'A suspicious buyer',
    blurb: 'A throwaway email address. The rules hold the payment for a person, and the AI writes the note.',
    watch: [{ tab: 'admin', section: 'review', label: 'Admin: Risk review' }],
  },
  {
    id: 'attack',
    title: 'Card testing attack',
    blurb: 'A bot keeps trying. The first attempts are held for a person, then it is blocked at once.',
    watch: [
      { tab: 'admin', section: 'review', label: 'Admin: Risk review' },
      { tab: 'admin', section: 'overview', label: 'Admin: Overview' },
    ],
  },
  {
    id: 'outage',
    title: 'Mobile money outage',
    blurb: 'A corridor goes down. Sellers are told, buyers stop seeing it, and Method Match reorders.',
    watch: [
      { tab: 'admin', section: 'corridors', label: 'Admin: Corridors' },
      { tab: 'buyer', section: 'checkout', label: 'Buyer: Checkout' },
    ],
  },
  {
    id: 'recovery',
    title: 'The outage ends',
    blurb: 'Every corridor that is slow or down works again, and sellers are told.',
    watch: [{ tab: 'admin', section: 'corridors', label: 'Admin: Corridors' }],
  },
  {
    id: 'payday',
    title: 'Payday',
    blurb: 'Pay out what the demo seller is owed. Local payouts are simulated.',
    watch: [{ tab: 'seller', section: 'payouts', label: 'Seller: Payouts' }],
  },
]

const START_OF_DAY = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
const pick = (items) => items[randomInt(items.length)]
const ok = (text) => ({ text, tone: 'ok' })
const warn = (text) => ({ text, tone: 'warn' })
const bad = (text) => ({ text, tone: 'bad' })

const WHAT_HAPPENED = { in_review: 'held for review', blocked: 'blocked at once', processing: 'went ahead' }

export function createScenarioService({
  db,
  catalogRepository,
  checkout,
  simulator,
  admin,
  payouts,
  match,
  risk,
  ai,
  env,
  now = () => new Date(),
}) {
  const demo = createDemoRepository({ db })
  const audit = createAuditRepository({ db })
  let busy = false

  async function merchantOrFail() {
    const merchant = await catalogRepository.findMerchant(MERCHANT)
    if (!merchant) throw notFound('The demo seller is not there. Reset the demo.')
    return merchant
  }

  /* An invented buyer. A throwaway one uses a mail service the rules know. Numbers above the seed's keep the address new. */
  function person(country, { throwaway = false } = {}) {
    const rng = createRng(`${Date.now()}-${randomInt(1_000_000_000)}`)
    const { name, email } = buyerIdentity(rng, country, randomInt(10_000, 99_999))
    return { name, email: throwaway ? email.replace(/@example\.com$/, '@mailinator.com') : email }
  }

  async function ordinaryCourse(merchant) {
    const courses = (await catalogRepository.listProducts(merchant.id)).filter(
      (course) => course.priceUsdCents < ORDINARY_CENTS,
    )
    return pick(courses)
  }

  /* One payment through the real checkout. outcome says how the simulated provider answers, or nothing to leave it be. */
  async function pay({ product, offer, buyer, outcome = null }) {
    const { payment } = await checkout.createPayment({
      idempotencyKey: randomUUID(),
      merchant: MERCHANT,
      product: product.slug,
      country: offer.countryCode,
      method: offer.methodId,
      buyer,
    })
    if (outcome && payment.status === 'processing') return simulator.settle(payment.id, outcome)
    return payment
  }

  /* What stops a scenario from running now, or nothing. */
  async function blockers(merchant) {
    const [counts, troubled, owed, offers] = await Promise.all([
      demo.counts(),
      demo.troubledCorridors(),
      demo.owed(merchant.id),
      demo.liveOffers(merchant.id),
    ])
    const crowded = counts.waiting >= QUEUE_LIMIT
    const crowdedText = `The review queue already has ${counts.waiting} payments. Decide them first, or reset the demo.`
    const reasons = {
      suspicious: crowded ? crowdedText : null,
      attack: crowded ? crowdedText : null,
      outage: offers.some((offer) => offer.methodId === 'mobile_money' && offer.status === 'operational')
        ? null
        : 'Every mobile money corridor is already down.',
      recovery: troubled.length > 0 ? null : 'Nothing is down.',
      payday: owed > 0 ? null : 'The seller is paid up. Make a sale first.',
    }
    return { counts, reasons, offers, troubled }
  }

  const RUN = {
    async sale({ merchant, offers }) {
      const offer = pick(offers)
      const buyer = person(offer.countryCode)
      const payment = await pay({ product: await ordinaryCourse(merchant), offer, buyer, outcome: 'approve' })
      const paid = payment.status === 'succeeded'
      return {
        headline: `${shortName(buyer.name)} in ${offer.countryName} paid ${formatUsd(payment.amountUsdCents)}.`,
        steps: [
          ok(`${shortName(buyer.name)} chose ${offer.methodLabel} (simulated) in ${offer.countryName}.`),
          paid ? ok('The payment went through and the course unlocked.') : warn(`It ended as ${payment.status}.`),
          ...(paid ? [ok('The seller got a "New sale" notification, and the buyer a receipt.')] : []),
        ],
      }
    },

    async failure({ merchant, offers }) {
      const offer = pick(offers)
      const buyer = person(offer.countryCode)
      const payment = await pay({ product: await ordinaryCourse(merchant), offer, buyer, outcome: 'decline' })
      return {
        headline: `${shortName(buyer.name)} in ${offer.countryName} was declined.`,
        steps: [
          ok(`${shortName(buyer.name)} chose ${offer.methodLabel} (simulated) in ${offer.countryName}.`),
          bad(`${payment.failureMessage ?? 'The payment did not go through.'} Nothing was charged.`),
          ok('The buyer was told why, and was offered another try. The seller sees the failure.'),
        ],
      }
    },

    async rush({ merchant, offers }) {
      const started = Date.now()
      const results = []
      for (let index = 0; index < RUSH; index += 1) {
        const offer = pick(offers)
        results.push(
          await pay({
            product: await ordinaryCourse(merchant),
            offer,
            buyer: person(offer.countryCode),
            outcome: 'approve',
          }),
        )
      }
      const paid = results.filter((payment) => payment.status === 'succeeded').length
      const stopped = results.filter((payment) => ['in_review', 'blocked'].includes(payment.status)).length
      const burst = await demo.firedOn(
        results.map((payment) => payment.id),
        'seller_burst',
      )
      return {
        headline: `${paid} of ${RUSH} buyers paid in ${Math.max(1, Math.round((Date.now() - started) / 1000))} seconds.`,
        steps: [
          ok(
            `${paid} sales went through, from ${new Set(results.map((payment) => payment.country.code)).size} countries.`,
          ),
          burst > 0
            ? ok(`The rules noticed the burst on ${burst} of them. A burst only adds a few points, never a hold.`)
            : warn('The rules did not see a burst this time, since the payments were spread out.'),
          stopped === 0
            ? ok('Nobody was held or blocked. A busy launch alone never holds anyone.')
            : warn(`${stopped} payments were held or blocked, because of other signals.`),
        ],
      }
    },

    async suspicious({ merchant, offers }) {
      const offer = pick(offers)
      const buyer = person(offer.countryCode, { throwaway: true })
      const payment = await pay({ product: await ordinaryCourse(merchant), offer, buyer })
      const rating = await demo.assessmentOf(payment.id)
      return {
        headline: `A payment from a throwaway email address was ${WHAT_HAPPENED[payment.status] ?? payment.status}.`,
        steps: [
          ok(
            `The rules scored it ${rating.score} (${rating.level}): ${rating.signals.map((entry) => entry.label).join(', ')}.`,
          ),
          payment.status === 'in_review'
            ? ok('It waits for a person before any money moves. The buyer, the seller and the admin were told.')
            : warn(`It was ${WHAT_HAPPENED[payment.status] ?? payment.status}.`),
          rating.explanationSource === 'ai'
            ? ok(`The AI wrote the note: "${rating.explanation}"`)
            : ok('The rules wrote the note, since the AI was off, slow or over its budget.'),
        ],
      }
    },

    async attack({ merchant, offers }) {
      const offer = pick(offers)
      const buyer = person(offer.countryCode, { throwaway: true })
      const product = await ordinaryCourse(merchant)
      const steps = []
      let last
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        last = await pay({ product, offer, buyer })
        const rating = await demo.assessmentOf(last.id)
        const text = `Attempt ${attempt}: ${WHAT_HAPPENED[last.status] ?? last.status} (score ${rating.score}).`
        steps.push(last.status === 'blocked' ? bad(text) : last.status === 'in_review' ? warn(text) : ok(text))
      }
      steps.push(ok('The buyer, the seller and the admin were told. Nothing was charged.'))
      return {
        headline: `A bot made ${ATTEMPTS} attempts. The last one was ${WHAT_HAPPENED[last.status] ?? last.status}.`,
        steps,
      }
    },

    async outage({ offers }) {
      const target = pick(offers.filter((offer) => offer.methodId === 'mobile_money' && offer.status === 'operational'))
      await admin.setCorridor(target.countryCode, 'mobile_money', { status: 'down' }, 'demo-director')
      const order = await match.forCountry(MERCHANT, target.countryCode)
      const first = order.methods[0]
      return {
        headline: `${target.methodLabel} in ${target.countryName} is down.`,
        steps: [
          ok('Every seller that uses it was told.'),
          ok(`Buyers in ${target.countryName} no longer see it at checkout.`),
          first
            ? ok(`Method Match now puts ${first.label} first there.`)
            : warn(`No other method is open in ${target.countryName}.`),
        ],
      }
    },

    async recovery({ troubled }) {
      for (const corridor of troubled) {
        await admin.setCorridor(corridor.countryCode, corridor.methodId, { status: 'operational' }, 'demo-director')
      }
      return {
        headline: `${troubled.length} corridor${troubled.length === 1 ? ' is' : 's are'} working again.`,
        steps: [
          ...troubled.map((corridor) =>
            ok(`${corridor.methodLabel} in ${corridor.countryName} was ${corridor.status}.`),
          ),
          ok('Sellers that use them were told.'),
        ],
      }
    },

    async payday() {
      const run = await payouts.run(MERCHANT)
      const total = run.payouts.reduce((sum, payout) => sum + payout.amountUsdCents, 0)
      const sales = run.payouts.reduce((sum, payout) => sum + payout.paymentsCount, 0)
      return {
        headline: `${formatUsd(total)} paid out for ${sales} sales.`,
        steps: [
          ok(
            `${run.payouts.length} payout${run.payouts.length === 1 ? '' : 's'} made. Local methods and demo history are simulated.`,
          ),
          ok('The seller was told, and the balance is back to zero.'),
          ...run.skipped.map((entry) => warn(entry.reason)),
        ],
      }
    },
  }

  return {
    /* What the panel shows: whether the tools are on, where the demo stands, and which scenarios can run. */
    async state() {
      if (!env.demoTools) return { enabled: false, made: 0, waiting: 0, scenarios: [] }
      /* A database with its tables but no data, as a new deployment is. The way out is a reset, which writes the seed. */
      const merchant = await merchantOrFail().catch((error) => (error.status === 404 ? null : Promise.reject(error)))
      if (!merchant) {
        return {
          enabled: true,
          empty: true,
          made: 0,
          waiting: 0,
          ai: ai.enabled,
          scenarios: SCENARIOS.map((scenario) => ({
            ...scenario,
            available: false,
            reason: 'The demo has no data yet. Reset the demo to write it.',
          })),
        }
      }
      const { counts, reasons } = await blockers(merchant)
      return {
        enabled: true,
        made: counts.made,
        waiting: counts.waiting,
        ai: ai.enabled,
        scenarios: SCENARIOS.map((scenario) => ({
          ...scenario,
          available: !reasons[scenario.id],
          reason: reasons[scenario.id] ?? null,
        })),
      }
    },

    async run(id) {
      if (!env.demoTools) throw notFound()
      const scenario = SCENARIOS.find((entry) => entry.id === id)
      if (!scenario) throw notFound('There is no such scenario.')
      if (busy) throw conflict('Another scenario is running. Wait a moment.')
      busy = true
      try {
        const merchant = await merchantOrFail()
        const context = await blockers(merchant)
        if (context.reasons[id]) throw conflict(context.reasons[id])
        const started = Date.now()
        const result = await RUN[id]({ merchant, ...context })
        const seconds = Math.round((Date.now() - started) / 100) / 10
        await audit.record({
          actor: 'system',
          actorId: 'demo-director',
          action: 'scenario.run',
          entityType: 'scenario',
          entityId: id,
          data: { seconds },
        })
        return { id, title: scenario.title, seconds, watch: scenario.watch, ...result }
      } finally {
        busy = false
      }
    },

    /* Wipes the demo and writes a fresh seed dated today. */
    async reset() {
      if (!env.demoTools) throw notFound()
      if (busy) throw conflict('A scenario is running. Wait a moment.')
      const since = await demo.secondsSinceReset()
      if (since !== null && since * 1000 < RESET_COOLDOWN_MS) {
        throw tooManyRequests('The demo was reset a moment ago. Try again in a minute.')
      }

      busy = true
      try {
        const usage = await demo.usageSince(START_OF_DAY(now()).toISOString())
        const dataset = buildSeed({ now: now() })
        const written = await db.tx(async (t) => {
          await t.exec(CLEAR_SQL)
          const counts = await writeSeed(t, dataset)
          await demo.restoreUsage(t, usage)
          /* One signal for everyone with the app open. A failed broadcast must never undo the reset. */
          await t.exec(`do $$ begin
            perform realtime.send(jsonb_build_object('table', 'demo', 'op', 'RESET'), 'change', 'pb:events', false);
          exception when others then raise warning 'realtime broadcast failed: %', sqlerrm; end $$`)
          return counts
        })
        const scored = await risk.scoreHistory()
        await audit.record({
          actor: 'system',
          actorId: 'demo-director',
          action: 'demo.reset',
          data: { payments: written.payments, scored },
        })
        return { payments: written.payments, merchants: written.merchants, scored }
      } finally {
        busy = false
      }
    },
  }
}
