import { request } from './client.js'

/* The seller's dashboard. There is no sign-in in this demo: the seller is Prone Data Learning unless a page names another. */

/* ?a=1&b=2, leaving out what is empty. */
const query = (params = {}) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const getOverview = (params, options) => request(`/seller/overview${query(params)}`, options)

/* filters: status, method, country, link, q, from, to (days like 2026-11-04), sort, limit, offset */
export const getPayments = (filters, options) => request(`/seller/payments${query(filters)}`, options)
export const getPayment = (id, options) => request(`/seller/payments/${id}`, options)

export const getCustomers = (params, options) => request(`/seller/customers${query(params)}`, options)
export const getCustomer = (id, options) => request(`/seller/customers/${id}`, options)

export const getCountries = (params, options) => request(`/seller/countries${query(params)}`, options)
export const setMethod = (country, method, enabled) =>
  request(`/seller/countries/${country}/methods/${method}`, { method: 'PATCH', body: { enabled } })

export const getPayouts = (options) => request('/seller/payouts', options)
export const getPayout = (id, options) => request(`/seller/payouts/${id}`, options)
/* Pays out what is owed. Safe to press twice: a sale is only ever paid once. */
export const runPayout = () => request('/payouts/run', { method: 'POST', body: {} })
/* Asks PayPal how a payout is doing. */
export const refreshPayout = (id) => request(`/payouts/${id}/refresh`, { method: 'POST', body: {} })

export const getLinks = (options) => request('/seller/links', options)
export const createLink = (body) => request('/seller/links', { method: 'POST', body })
export const setLinkActive = (id, active) => request(`/seller/links/${id}`, { method: 'PATCH', body: { active } })

/* A payment link as a buyer meets it. */
export const resolveLink = (code, options) => request(`/links/${code}`, options)
