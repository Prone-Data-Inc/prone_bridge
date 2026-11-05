import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams } from '#server/lib/validate.js'

const params = z.object({ id: z.string().regex(/^[a-z]{3,20}$/, 'Choose a scenario.') })
/* Wiping the demo needs the caller to say so, so a stray request cannot do it. */
const reset = z.object({ confirm: z.literal(true, 'Confirm the reset.') })

export const createDemoController = ({ scenarioService }) => ({
  state: async (c) => ok(c, await scenarioService.state()),
  run: async (c) => ok(c, await scenarioService.run(parseParams(c, params).id)),
  reset: async (c) => {
    await parseBody(c, reset)
    return ok(c, await scenarioService.reset())
  },
})
