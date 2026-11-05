import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* The admin's view of the whole network. There is no sign-in in this demo: the admin is whoever opens the Admin tab.
   Changes are limited more tightly than reads. */
export function adminRoutes({ admin }) {
  const routes = new Hono()
  const changes = rateLimit({ name: 'admin-changes', max: 60, windowMs: 60_000 })

  routes.get('/overview', admin.overview)
  routes.get('/transactions', admin.transactions)
  routes.get('/transactions/:id', admin.transaction)
  routes.get('/review', admin.review)
  routes.post('/review/:id/approve', changes, admin.approve)
  routes.post('/review/:id/reject', changes, admin.reject)
  routes.get('/merchants', admin.merchants)
  routes.get('/corridors', admin.corridors)
  routes.patch('/corridors/:country/methods/:method', changes, admin.setCorridor)
  routes.get('/settlements', admin.settlements)
  routes.post('/settlements/run', changes, admin.runSettlement)
  routes.get('/fairness', admin.fairness)
  routes.post('/fairness/probe', changes, admin.probe)
  routes.get('/audit', admin.audit)
  return routes
}
