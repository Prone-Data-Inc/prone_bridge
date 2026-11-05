import { z } from 'zod'
import { MESSAGES } from '#server/lib/copilot.js'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams, parseQuery } from '#server/lib/validate.js'

const merchant = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')
  .default('pdl')

const base = z.object({ merchant })
const ask = z.object({ merchant, messages: MESSAGES })
const idParams = z.object({ id: z.uuid('That is not a valid id.') })

export const createCopilotController = ({ copilotService }) => ({
  status: async (c) => ok(c, await copilotService.status(parseQuery(c, base).merchant)),

  ask: async (c) => {
    const body = await parseBody(c, ask)
    return ok(c, await copilotService.ask(body.merchant, body.messages))
  },

  confirm: async (c) => {
    const { id } = parseParams(c, idParams)
    return ok(c, await copilotService.confirm((await parseBody(c, base)).merchant, id))
  },

  dismiss: async (c) => {
    const { id } = parseParams(c, idParams)
    return ok(c, await copilotService.dismiss((await parseBody(c, base)).merchant, id))
  },
})
