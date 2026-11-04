import { Hono } from 'hono'

export function healthRoutes({ health }) {
  const routes = new Hono()
  routes.get('/', health.get)
  return routes
}
