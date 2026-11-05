import { request } from './client.js'

/* Method Match: the payment methods of a country, best first, with how often each succeeds there. */
export const getMethodMatch = (country, options) =>
  request(`/checkout/match?merchant=pdl&country=${encodeURIComponent(country)}`, options)

/* A visit to the checkout. Lets the seller see who started and who finished. */
export const startSession = ({ product, country, link, merchant = 'pdl' }) =>
  request('/checkout/sessions', { method: 'POST', body: { merchant, product, country, link } })

export const changeSessionCountry = (id, country) =>
  request(`/checkout/sessions/${id}`, { method: 'PATCH', body: { country } })

/* idempotencyKey makes a repeated request the same payment: send the same key again to retry safely. */
export const createPayment = (body) => request('/checkout/payments', { method: 'POST', body })

export const getPayment = (id, options) => request(`/checkout/payments/${id}`, options)

/* The simulated payment methods have no real provider. This plays the provider's answer: approve, decline or timeout. */
export const settleSimulated = (id, outcome) =>
  request(`/simulator/payments/${id}/outcome`, { method: 'POST', body: { outcome } })
