import { Hono } from 'hono'

export function catalogRoutes({ catalog }) {
  const routes = new Hono()
  routes.get('/products', catalog.products)
  routes.get('/countries', catalog.countries)
  return routes
}
