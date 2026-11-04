import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams } from '#server/lib/validate.js'

const id = z.uuid('That is not a valid id.')
const run = z.object({
  merchant: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/, 'Use a name like pdl.')
    .default('pdl'),
})

export const createPayoutController = ({ payoutService }) => ({
  /* Pays out what the seller is owed. */
  run: async (c) => ok(c, await payoutService.run((await parseBody(c, run)).merchant), 201),

  get: async (c) => ok(c, { payout: await payoutService.get(parseParams(c, z.object({ id })).id) }),

  refresh: async (c) => ok(c, { payout: await payoutService.refresh(parseParams(c, z.object({ id })).id) }),
})
