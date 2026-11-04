/* The Vercel function wiring: a web-standard Request in, a Response out, the same shape Vercel calls. */
import { describe, expect, it } from 'vitest'
import handler from './index.js'

describe('Vercel entry', () => {
  it('exposes a fetch handler', () => {
    expect(typeof handler.fetch).toBe('function')
  })

  it('answers the health route', async () => {
    const response = await handler.fetch(new Request('https://pronebridge.example/api/health'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('ok')
  })

  it('answers unknown API paths with a JSON 404', async () => {
    const response = await handler.fetch(new Request('https://pronebridge.example/api/unknown'))
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('not_found')
  })
})
