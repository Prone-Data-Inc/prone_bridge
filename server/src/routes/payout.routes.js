import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

export function payoutRoutes({ payouts }) {
  const routes = new Hono()
  routes.post('/run', rateLimit({ name: 'payout-run', max: 10, windowMs: 60_000 }), payouts.run)
  routes.get('/:id', payouts.get)
  routes.post('/:id/refresh', rateLimit({ name: 'payout-refresh', max: 20, windowMs: 60_000 }), payouts.refresh)
  return routes
}
