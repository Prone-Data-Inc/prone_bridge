import { Hono } from 'hono'

export function linkRoutes({ links }) {
  const routes = new Hono()
  routes.get('/:code', links.resolve)
  return routes
}
