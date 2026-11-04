import { Hono } from 'hono'

export function notificationRoutes({ notifications }) {
  const routes = new Hono()
  routes.get('/', notifications.list)
  routes.get('/summary', notifications.summary)
  routes.post('/read', notifications.markRead)
  return routes
}
