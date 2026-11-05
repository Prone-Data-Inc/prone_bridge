import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams, parseQuery } from '#server/lib/validate.js'

const merchant = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')
  .default('pdl')
const id = z.uuid('That is not a valid id.')
const days = z.coerce
  .number()
  .int()
  .refine((value) => [7, 30, 90].includes(value), 'Choose 7, 30 or 90 days.')
  .default(30)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-04.')

const PAYMENT_STATUSES = ['requires_payment', 'processing', 'succeeded', 'failed', 'blocked', 'in_review', 'refunded']

const base = z.object({ merchant })
const overview = z.object({ merchant, days })

const payments = z.object({
  merchant,
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z
    .string()
    .regex(/^[a-z_]{2,30}$/, 'Choose a payment method.')
    .optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Choose a country.')
    .optional(),
  link: id.optional(),
  q: z.string().trim().max(80).optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z.enum(['newest', 'oldest', 'amount']).default('newest'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
})

const customers = z.object({
  merchant,
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
})

const countries = z.object({ merchant, days })
const methodParams = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, 'Choose a country.'),
  method: z.string().regex(/^[a-z_]{2,30}$/, 'Choose a payment method.'),
})
const methodBody = z.object({ merchant, enabled: z.boolean() })

const createLink = z.object({
  merchant,
  product: z.string().regex(/^[a-z0-9-]{1,60}$/, 'Choose a course.'),
  title: z.string().trim().min(1, 'Give the link a name.').max(80, 'That name is too long.').optional(),
  note: z.string().trim().max(240, 'Keep the note under 240 characters.').optional(),
  maxUses: z.number().int().min(1).max(100_000).optional(),
  expiresAt: z.iso.datetime({ message: 'Use a date and time.' }).optional(),
})
const linkBody = z.object({ merchant, active: z.boolean() })

const idParams = z.object({ id })

/* A day typed as 2026-11-04 is the whole day, in UTC: it starts at midnight, and the end of the range is the next midnight. */
const startOf = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined)
const dayAfter = (value) => (value ? new Date(new Date(`${value}T00:00:00.000Z`).getTime() + 86_400_000) : undefined)

export const createSellerController = ({ sellerService }) => ({
  overview: async (c) => {
    const query = parseQuery(c, overview)
    return ok(c, await sellerService.overview(query.merchant, query.days))
  },

  payments: async (c) => {
    const { merchant: slug, sort, limit, offset, from, to, ...filters } = parseQuery(c, payments)
    return ok(
      c,
      await sellerService.payments(
        slug,
        { ...filters, from: startOf(from), to: dayAfter(to) },
        { sort, limit, offset },
      ),
    )
  },

  payment: async (c) => ok(c, await sellerService.payment(parseQuery(c, base).merchant, parseParams(c, idParams).id)),

  customers: async (c) => {
    const { merchant: slug, ...options } = parseQuery(c, customers)
    return ok(c, await sellerService.customers(slug, options))
  },

  customer: async (c) => ok(c, await sellerService.customer(parseQuery(c, base).merchant, parseParams(c, idParams).id)),

  countries: async (c) => {
    const query = parseQuery(c, countries)
    return ok(c, await sellerService.countries(query.merchant, query.days))
  },

  setMethod: async (c) => {
    const { country, method } = parseParams(c, methodParams)
    const body = await parseBody(c, methodBody)
    return ok(c, await sellerService.setMethod(body.merchant, country, method, body.enabled))
  },

  payouts: async (c) => ok(c, await sellerService.payouts(parseQuery(c, base).merchant)),

  payout: async (c) => ok(c, await sellerService.payout(parseQuery(c, base).merchant, parseParams(c, idParams).id)),

  links: async (c) => ok(c, await sellerService.links(parseQuery(c, base).merchant)),

  createLink: async (c) => {
    const { merchant: slug, ...link } = await parseBody(c, createLink)
    return ok(c, await sellerService.createLink(slug, link), 201)
  },

  setLinkActive: async (c) => {
    const body = await parseBody(c, linkBody)
    return ok(c, await sellerService.setLinkActive(body.merchant, parseParams(c, idParams).id, body.active))
  },
})
