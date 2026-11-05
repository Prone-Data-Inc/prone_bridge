import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* Taking a payment is the one thing worth a tighter limit than the rest of the API. */
export function checkoutRoutes({ checkout }) {
  const routes = new Hono()
  routes.use('*', rateLimit({ name: 'checkout', max: 60, windowMs: 60_000 }))
  routes.get('/match', checkout.match)
  routes.post('/sessions', checkout.startSession)
  routes.patch('/sessions/:id', checkout.changeCountry)
  routes.post('/payments', checkout.createPayment)
  routes.get('/payments/:id', checkout.getPayment)
  routes.post('/payments/:id/capture', checkout.capturePayment)
  routes.post('/payments/:id/cancel', checkout.cancelPayment)
  return routes
}
