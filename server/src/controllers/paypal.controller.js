import { ok } from '#server/lib/response.js'

export const createPaypalController = ({ paypalService }) => ({
  /* Is PayPal connected? The checkout uses this to switch card and PayPal on. */
  status: async (c) => ok(c, paypalService.status()),

  /* A short lived key for the browser's PayPal SDK. */
  clientToken: async (c) => ok(c, await paypalService.clientToken()),
})
