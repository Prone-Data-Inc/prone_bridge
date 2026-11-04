import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseParams } from '#server/lib/validate.js'

const params = z.object({ buyerId: z.uuid('That is not a valid id.') })

export const createLearnerController = ({ learnerService }) => ({
  courses: async (c) => ok(c, await learnerService.courses(parseParams(c, params).buyerId)),
})
