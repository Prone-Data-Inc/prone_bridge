import { request } from './client.js'

/* A visit to the checkout. Lets the seller see who started and who finished. */
export const startSession = ({ product, country, merchant = 'pdl' }) =>
  request('/checkout/sessions', { method: 'POST', body: { merchant, product, country } })

export const changeSessionCountry = (id, country) =>
  request(`/checkout/sessions/${id}`, { method: 'PATCH', body: { country } })

/* idempotencyKey makes a repeated request the same payment: send the same key again to retry safely. */
export const createPayment = (body) => request('/checkout/payments', { method: 'POST', body })

export const getPayment = (id, options) => request(`/checkout/payments/${id}`, options)

/* The simulated payment methods have no real provider. This plays the provider's answer: approve, decline or timeout. */
export const settleSimulated = (id, outcome) =>
  request(`/simulator/payments/${id}/outcome`, { method: 'POST', body: { outcome } })
