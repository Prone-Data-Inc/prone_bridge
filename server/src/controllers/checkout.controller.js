import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseParams } from '#server/lib/validate.js'

const slug = z.string().regex(/^[a-z0-9-]{1,60}$/, 'Use a name like ai-for-work.')
const country = z.string().regex(/^[A-Z]{2}$/, 'Choose a country.')
const id = z.uuid('That is not a valid id.')

const startSession = z.object({ merchant: slug.default('pdl'), product: slug, country })
const changeCountry = z.object({ country })

const createPayment = z.object({
  idempotencyKey: id,
  merchant: slug.default('pdl'),
  product: slug,
  country,
  method: z.string().regex(/^[a-z_]{2,30}$/, 'Choose a payment method.'),
  sessionId: id.optional(),
  buyer: z.object({
    name: z.string().trim().min(2, 'Enter your name.').max(80, 'That name is too long.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email('Enter a valid email.'))
      .pipe(z.string().max(120, 'That email is too long.')),
  }),
})

export const createCheckoutController = ({ checkoutService }) => ({
  startSession: async (c) => ok(c, await checkoutService.startSession(await parseBody(c, startSession)), 201),

  changeCountry: async (c) => {
    const { id: sessionId } = parseParams(c, z.object({ id }))
    return ok(c, await checkoutService.changeSessionCountry(sessionId, (await parseBody(c, changeCountry)).country))
  },

  createPayment: async (c) =>
    ok(c, { payment: await checkoutService.createPayment(await parseBody(c, createPayment)) }, 201),

  getPayment: async (c) => ok(c, { payment: await checkoutService.getPayment(parseParams(c, z.object({ id })).id) }),
})
