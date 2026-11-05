import { request } from './client.js'

/* The seller copilot. The seller is Prone Data Learning unless a page names another. */

/* Is the AI on, what is left of today's budget, and which proposed changes are waiting for a decision. */
export const getCopilotStatus = (options) => request('/copilot/status', options)

/* messages: [{ role: 'user' | 'assistant', content }], ending with the seller's question. */
export const askCopilot = (messages, options) =>
  request('/copilot/ask', { method: 'POST', body: { messages }, ...options })

/* A proposed change does nothing until the seller confirms it here. */
export const confirmAction = (id) => request(`/copilot/actions/${id}/confirm`, { method: 'POST', body: {} })
export const dismissAction = (id) => request(`/copilot/actions/${id}/dismiss`, { method: 'POST', body: {} })
