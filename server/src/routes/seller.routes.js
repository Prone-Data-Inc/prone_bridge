import { Hono } from 'hono'
import { rateLimit } from '#server/middleware/rateLimit.js'

/* The seller's dashboard. There is no sign-in in this demo: the seller is whoever the page names, Prone Data Learning by
   default. Changes are limited more tightly than reads. */
export function sellerRoutes({ seller }) {
  const routes = new Hono()
  const changes = rateLimit({ name: 'seller-changes', max: 60, windowMs: 60_000 })

  routes.get('/overview', seller.overview)
  routes.get('/payments', seller.payments)
  routes.get('/payments/:id', seller.payment)
  routes.get('/customers', seller.customers)
  routes.get('/customers/:id', seller.customer)
  routes.get('/countries', seller.countries)
  routes.patch('/countries/:country/methods/:method', changes, seller.setMethod)
  routes.get('/payouts', seller.payouts)
  routes.get('/payouts/:id', seller.payout)
  routes.get('/links', seller.links)
  routes.post('/links', changes, seller.createLink)
  routes.patch('/links/:id', changes, seller.setLinkActive)
  return routes
}
