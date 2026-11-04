/* The API surface. Each feature adds its router here. Anything that no router answers is a JSON 404, so a wrong path
   under /api is never mistaken for a page of the web app. */
import { Hono } from 'hono'
import { notFound } from '#server/lib/errors.js'
import { catalogRoutes } from './catalog.routes.js'
import { healthRoutes } from './health.routes.js'

export function createRoutes({ controllers }) {
  const routes = new Hono()
  routes.route('/health', healthRoutes(controllers))
  routes.route('/catalog', catalogRoutes(controllers))
  routes.all('*', () => {
    throw notFound()
  })
  return routes
}
