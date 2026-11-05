import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* The demo director. Running a scenario writes real rows and may call the AI, and a reset wipes the demo, so both are
   limited tightly. The reset also keeps its own cooldown in the database, which a spoofed address cannot get around. */
export function demoRoutes({ demo }) {
  const routes = new Hono()
  const running = rateLimit({ name: 'demo-run', max: 10, windowMs: 60_000 })
  const resetting = rateLimit({ name: 'demo-reset', max: 3, windowMs: 600_000 })

  routes.get('/state', demo.state)
  routes.post('/scenarios/:id/run', running, demo.run)
  routes.post('/reset', resetting, demo.reset)
  return routes
}
