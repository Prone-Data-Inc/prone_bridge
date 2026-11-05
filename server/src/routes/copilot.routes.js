import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* The seller copilot. Asking costs money, so it has the tightest limit of all, on top of the day's token budget. */
export function copilotRoutes({ copilot }) {
  const routes = new Hono()
  const asking = rateLimit({ name: 'copilot-ask', max: 15, windowMs: 60_000 })
  const deciding = rateLimit({ name: 'copilot-decide', max: 30, windowMs: 60_000 })

  routes.get('/status', copilot.status)
  routes.post('/ask', asking, copilot.ask)
  routes.post('/actions/:id/confirm', deciding, copilot.confirm)
  routes.post('/actions/:id/dismiss', deciding, copilot.dismiss)
  return routes
}
