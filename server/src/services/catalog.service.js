/* What a buyer may see of a merchant: its products, and the countries where they can pay, each with the methods the
   merchant has switched on. Methods marked simulated are labeled as such for the interface. */
import { notFound, unavailable } from '#server/lib/errors.js'

export function createCatalogService({ repository }) {
  const merchantOrFail = async (slug) => {
    if (!repository) throw unavailable('The database is not connected yet.')
    const merchant = await repository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant
  }

  return {
    async listProducts(slug) {
      const merchant = await merchantOrFail(slug)
      return { merchant: publicMerchant(merchant), products: await repository.listProducts(merchant.id) }
    },

    async getProduct(slug, product) {
      const merchant = await merchantOrFail(slug)
      const found = await repository.findProduct(merchant.id, product)
      if (!found) throw notFound('That course is not available.')
      return { merchant: publicMerchant(merchant), product: found }
    },

    async listCountries(slug) {
      const merchant = await merchantOrFail(slug)
      const countries = (await repository.listCountries(merchant.id))
        .map((country) => ({ ...country, methods: country.methods.filter((method) => method.enabled) }))
        .filter((country) => country.methods.length > 0)
      return { merchant: publicMerchant(merchant), countries }
    },
  }
}

const publicMerchant = ({ slug, name, tagline }) => ({ slug, name, tagline })
