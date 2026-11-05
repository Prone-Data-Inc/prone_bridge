/* Method Match for the checkout and the copilot: the methods a buyer can use in their country, best first. */
import { MATCH_DAYS, rankMethods } from '#server/lib/match.js'
import { badRequest, notFound } from '#server/lib/errors.js'
import { createCheckoutRepository } from '#server/repositories/checkout.repository.js'
import { createMatchRepository } from '#server/repositories/match.repository.js'

const DAY = 86_400_000

export function createMatchService({ db, catalogRepository, now = () => new Date() }) {
  const match = createMatchRepository({ db })
  const checkout = createCheckoutRepository({ db })

  return {
    async forCountry(merchantSlug, country) {
      const merchant = await catalogRepository.findMerchant(merchantSlug)
      if (!merchant) throw notFound('We could not find that seller.')
      if (!(await checkout.countryExists(country))) throw badRequest('We do not serve that country yet.')

      const since = new Date(now().getTime() - MATCH_DAYS * DAY).toISOString()
      const [offers, local, network] = await Promise.all([
        match.offers(merchant.id, country),
        match.outcomes(since, country),
        match.outcomes(since),
      ])
      return {
        country,
        days: MATCH_DAYS,
        basis: `Based on how payments with each method ended in the last ${MATCH_DAYS} days. Demo data.`,
        methods: rankMethods(offers, { local, network }),
      }
    },
  }
}
