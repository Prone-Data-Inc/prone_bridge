import { request } from './client.js'

/* Is PayPal connected? { available, environment }. Card and PayPal can only be chosen when it is. */
export const getPaypalStatus = (options) => request('/paypal/status', options)

/* A short lived key (15 minutes) for PayPal's SDK in the browser. It cannot take or move money. */
export const getClientToken = () => request('/paypal/client-token', { method: 'POST', body: {} })

/* The buyer approved the order in PayPal's window or card fields. The server takes the money and answers with the payment.
   outcome 'decline' asks the PayPal sandbox to refuse it, so a failed payment can be shown on demand. */
export const capturePayment = (id, orderId, outcome = 'approve') =>
  request(`/checkout/payments/${id}/capture`, { method: 'POST', body: { orderId, outcome } })

/* The buyer closed PayPal's window. */
export const cancelPayment = (id) => request(`/checkout/payments/${id}/cancel`, { method: 'POST', body: {} })
