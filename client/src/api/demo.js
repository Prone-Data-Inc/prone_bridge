import { request } from './client.js'

/* The demo director: scenarios that go through the real pipeline, and a reset. */

/* { enabled, made, waiting, ai, scenarios: [{ id, title, blurb, watch, available, reason }] } */
export const getDemoState = (options) => request('/demo/state', options)

/* Runs one scenario and answers { id, title, headline, steps: [{ text, tone }], watch, seconds }. */
export const runScenario = (id) => request(`/demo/scenarios/${id}/run`, { method: 'POST', body: {} })

/* Wipes what was made and writes a fresh seed dated today. */
export const resetDemo = () => request('/demo/reset', { method: 'POST', body: { confirm: true } })
