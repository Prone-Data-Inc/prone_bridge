import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams, parseQuery } from '#server/lib/validate.js'

const id = z.uuid('That is not a valid id.')
const days = z.coerce
  .number()
  .int()
  .refine((value) => [7, 30, 90].includes(value), 'Choose 7, 30 or 90 days.')
  .default(30)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-04.')
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')

const PAYMENT_STATUSES = ['requires_payment', 'processing', 'succeeded', 'failed', 'blocked', 'in_review', 'refunded']

const range = z.object({ days })

const transactions = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  merchant: slug.optional(),
  method: z
    .string()
    .regex(/^[a-z_]{2,30}$/, 'Choose a payment method.')
    .optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Choose a country.')
    .optional(),
  level: z.enum(['low', 'medium', 'high']).optional(),
  q: z.string().trim().max(80).optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z.enum(['newest', 'oldest', 'amount', 'risk']).default('newest'),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
})

const idParams = z.object({ id })
const review = z.object({ note: z.string().trim().max(240, 'Keep the note under 240 characters.').optional() })

const corridorParams = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, 'Choose a country.'),
  method: z.string().regex(/^[a-z_]{2,30}$/, 'Choose a payment method.'),
})
const corridorBody = z.object({
  status: z.enum(['operational', 'degraded', 'down']).optional(),
  enabled: z.boolean().optional(),
})

const settlementBody = z.object({ merchant: slug })
const probeBody = z.object({ payment: id.optional() })

const audit = z.object({
  actor: z.enum(['buyer', 'seller', 'admin', 'system', 'ai', 'paypal']).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300),
  offset: z.coerce.number().int().min(0).default(0),
})

/* A day typed as 2026-11-04 is the whole day, in UTC. */
const startOf = (value) => (value ? new Date(`${value}T00:00:00.000Z`) : undefined)
const dayAfter = (value) => (value ? new Date(new Date(`${value}T00:00:00.000Z`).getTime() + 86_400_000) : undefined)

export const createAdminController = ({ adminService }) => ({
  overview: async (c) => ok(c, await adminService.overview(parseQuery(c, range).days)),

  transactions: async (c) => {
    const { sort, limit, offset, from, to, ...filters } = parseQuery(c, transactions)
    return ok(
      c,
      await adminService.transactions({ ...filters, from: startOf(from), to: dayAfter(to) }, { sort, limit, offset }),
    )
  },

  transaction: async (c) => ok(c, await adminService.transaction(parseParams(c, idParams).id)),

  review: async (c) => ok(c, await adminService.review()),
  approve: async (c) =>
    ok(c, await adminService.approve(parseParams(c, idParams).id, (await parseBody(c, review)).note)),
  reject: async (c) => ok(c, await adminService.reject(parseParams(c, idParams).id, (await parseBody(c, review)).note)),

  merchants: async (c) => ok(c, await adminService.merchants(parseQuery(c, range).days)),

  corridors: async (c) => ok(c, await adminService.corridors(parseQuery(c, range).days)),
  setCorridor: async (c) => {
    const { country, method } = parseParams(c, corridorParams)
    return ok(c, await adminService.setCorridor(country, method, await parseBody(c, corridorBody)))
  },

  settlements: async (c) => ok(c, await adminService.settlements()),
  runSettlement: async (c) => ok(c, await adminService.runSettlement((await parseBody(c, settlementBody)).merchant)),

  fairness: async (c) => ok(c, await adminService.fairness(parseQuery(c, range).days)),
  probe: async (c) => ok(c, await adminService.probe((await parseBody(c, probeBody)).payment)),

  audit: async (c) => ok(c, await adminService.audit(parseQuery(c, audit))),
})
