import { Hono } from 'hono'

/* Where PayPal calls us. There is no sign-in here: the signature on each event, checked by PayPal, is the proof. */
export function webhookRoutes({ webhooks }) {
  const routes = new Hono()
  routes.post('/paypal', webhooks.paypal)
  return routes
}
