import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseParams } from '#server/lib/validate.js'

const params = z.object({ code: z.string().regex(/^[a-z0-9]{6,12}$/, 'That is not a payment link.') })

export const createLinkController = ({ linkService }) => ({
  /* What a payment link points to, and whether it can still be used. Open to anyone who has the link. */
  resolve: async (c) => ok(c, { link: await linkService.resolve(parseParams(c, params).code) }),
})
