import { request } from './client.js'

const query = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value != null && value !== '') search.set(key, value)
  return search.toString()
}

/* audience: 'buyer' | 'seller' | 'admin'. A seller is named by its slug, a buyer by their id. */
export const listNotifications = ({ audience, merchant, buyer, limit = 20 }, options) =>
  request(`/notifications?${query({ audience, merchant, buyer, limit })}`, options)

/* { buyer, seller, admin } unread counts. */
export const getNotificationSummary = ({ merchant, buyer }, options) =>
  request(`/notifications/summary?${query({ merchant, buyer })}`, options)

/* Without ids, marks everything of that audience as read. */
export const markNotificationsRead = ({ audience, merchant, buyer, ids }) =>
  request('/notifications/read', { method: 'POST', body: { audience, merchant, buyer, ids } })
