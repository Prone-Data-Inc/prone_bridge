import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseParams, parseQuery } from '#server/lib/validate.js'

const query = z.object({
  merchant: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')
    .default('pdl'),
})

const productParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,60}$/, 'That is not a course name.') })

export const createCatalogController = ({ catalogService }) => ({
  products: async (c) => ok(c, await catalogService.listProducts(parseQuery(c, query).merchant)),
  product: async (c) =>
    ok(c, await catalogService.getProduct(parseQuery(c, query).merchant, parseParams(c, productParams).slug)),
  countries: async (c) => ok(c, await catalogService.listCountries(parseQuery(c, query).merchant)),
})
