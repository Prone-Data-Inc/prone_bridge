import { Hono } from 'hono'

export function learnerRoutes({ learners }) {
  const routes = new Hono()
  routes.get('/:buyerId/courses', learners.courses)
  return routes
}
