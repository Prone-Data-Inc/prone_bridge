/* Method Match: which payment method is most likely to succeed for a buyer, so it can be offered first.

   It is arithmetic on real outcomes, not a language model, so it is instant, free and can be checked: for each method, how
   often payments in this country succeeded over the last 30 days. A method with few payments here borrows from how that
   method does everywhere on ProneBridge (the same as adding a few average payments to its count), so a lucky streak of
   three payments does not win. A method that is slow right now ("degraded") is pushed down.

   A country picks the methods that exist and how they have performed there. It says nothing about the buyer. */

export const MATCH_DAYS = 30
/* How many "average" payments a method starts with. */
const PRIOR_WEIGHT = 8
/* Success rate assumed for a method nobody has used yet. */
const FALLBACK_RATE = 0.85
const DEGRADED_FACTOR = 0.75
const ENOUGH = 10
const PLENTY = 30

const percent = (rate) => `${Math.round(rate * 100)}%`

/* methods: [{ id, label, status, sort }] on offer in the country right now.
   local / network: Map of method id -> { paid, finished } for the country and for the whole network.
   Answers the methods best first, each with its estimated success rate and the reason in words. */
export function rankMethods(methods, { local, network }) {
  const ranked = methods.map((method) => {
    const here = local.get(method.id) ?? { paid: 0, finished: 0 }
    const everywhere = network.get(method.id)
    const prior = everywhere && everywhere.finished > 0 ? everywhere.paid / everywhere.finished : FALLBACK_RATE
    const estimate = (here.paid + PRIOR_WEIGHT * prior) / (here.finished + PRIOR_WEIGHT)
    const degraded = method.status === 'degraded'
    const confidence = here.finished >= PLENTY ? 'high' : here.finished >= ENOUGH ? 'medium' : 'low'

    let reason
    if (degraded) reason = 'Slower than usual right now.'
    else if (here.finished >= ENOUGH) {
      reason = `${percent(here.paid / here.finished)} of payments here succeed (${here.paid} of ${here.finished}).`
    } else reason = `Not many payments here yet, so this uses the ProneBridge average of ${percent(prior)}.`

    return {
      id: method.id,
      label: method.label,
      sort: method.sort,
      status: method.status,
      successRate: estimate,
      sample: here.finished,
      confidence,
      score: degraded ? estimate * DEGRADED_FACTOR : estimate,
      reason,
    }
  })

  ranked.sort((a, b) => b.score - a.score || b.sample - a.sample || a.sort - b.sort)
  return ranked.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    status: entry.status,
    successRate: entry.successRate,
    sample: entry.sample,
    confidence: entry.confidence,
    reason: entry.reason,
    rank: index + 1,
    best: index === 0,
  }))
}
