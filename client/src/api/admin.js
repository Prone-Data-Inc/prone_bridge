import { request } from './client.js'

/* The admin's view of the whole network. There is no sign-in in this demo: the admin is whoever opens the Admin tab. */

/* ?a=1&b=2, leaving out what is empty. */
const query = (params = {}) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const getOverview = (params, options) => request(`/admin/overview${query(params)}`, options)

/* filters: status, merchant, method, country, level, q, from, to (days like 2026-11-04), sort, limit, offset */
export const getTransactions = (filters, options) => request(`/admin/transactions${query(filters)}`, options)
export const getTransaction = (id, options) => request(`/admin/transactions/${id}`, options)

export const getReview = (options) => request('/admin/review', options)
export const approvePayment = (id, note) => request(`/admin/review/${id}/approve`, { method: 'POST', body: { note } })
export const rejectPayment = (id, note) => request(`/admin/review/${id}/reject`, { method: 'POST', body: { note } })

export const getMerchants = (params, options) => request(`/admin/merchants${query(params)}`, options)

export const getCorridors = (params, options) => request(`/admin/corridors${query(params)}`, options)
/* change: { status: 'operational' | 'degraded' | 'down' } or { enabled: true | false } */
export const setCorridor = (country, method, change) =>
  request(`/admin/corridors/${country}/methods/${method}`, { method: 'PATCH', body: change })

export const getSettlements = (options) => request('/admin/settlements', options)
export const runSettlement = (merchant) => request('/admin/settlements/run', { method: 'POST', body: { merchant } })

export const getFairness = (params, options) => request(`/admin/fairness${query(params)}`, options)
/* Scores one real payment again as if it came from each country. Without a payment, the latest flagged one is used. */
export const probeFairness = (payment) => request('/admin/fairness/probe', { method: 'POST', body: { payment } })

export const getAudit = (params, options) => request(`/admin/audit${query(params)}`, options)
