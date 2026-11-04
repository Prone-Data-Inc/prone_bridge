import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* The stand-in for a provider's answer on the simulated payment methods. See simulator.service.js. */
export function simulatorRoutes({ simulator }) {
  const routes = new Hono()
  routes.use('*', rateLimit({ name: 'simulator', max: 60, windowMs: 60_000 }))
  routes.post('/payments/:id/outcome', simulator.settle)
  return routes
}
