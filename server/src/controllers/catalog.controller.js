import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseQuery } from '#server/lib/validate.js'

const query = z.object({
  merchant: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')
    .default('pdl'),
})

export const createCatalogController = ({ catalogService }) => ({
  products: async (c) => ok(c, await catalogService.listProducts(parseQuery(c, query).merchant)),
  countries: async (c) => ok(c, await catalogService.listCountries(parseQuery(c, query).merchant)),
})
