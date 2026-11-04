import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

export function paypalRoutes({ paypal }) {
  const routes = new Hono()
  routes.get('/status', paypal.status)
  /* Each checkout asks for one. A tighter limit stops a loop from hammering PayPal's token service. */
  routes.post('/client-token', rateLimit({ name: 'paypal-token', max: 30, windowMs: 60_000 }), paypal.clientToken)
  return routes
}
