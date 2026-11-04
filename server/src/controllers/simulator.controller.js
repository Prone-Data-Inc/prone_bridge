import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams } from '#server/lib/validate.js'

const params = z.object({ id: z.uuid('That is not a valid id.') })
const body = z.object({ outcome: z.enum(['approve', 'decline', 'timeout'], 'Choose approve, decline or timeout.') })

export const createSimulatorController = ({ simulatorService }) => ({
  settle: async (c) => {
    const { id } = parseParams(c, params)
    const { outcome } = await parseBody(c, body)
    return ok(c, { payment: await simulatorService.settle(id, outcome) })
  },
})
