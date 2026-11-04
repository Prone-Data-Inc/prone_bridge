import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { createLogger } from './lib/logger.js'

const silent = createLogger({ level: 'silent' })
const make = (overrides = {}) => createApp({ env: loadEnv({ NODE_ENV: 'test', ...overrides }), logger: silent })

describe('GET /api/health', () => {
  it('answers ok with the service report', async () => {
    const response = await make().request('/api/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ status: 'ok', service: 'pronebridge-api', environment: 'test' })
    expect(body.data.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(new Date(body.data.time).toString()).not.toBe('Invalid Date')
  })

  it('reports which integrations have keys, without exposing them', async () => {
    const app = make({ PAYPAL_CLIENT_ID: 'id-value', PAYPAL_CLIENT_SECRET: 'secret-value' })
    const text = await (await app.request('/api/health')).text()

    expect(JSON.parse(text).data.integrations).toEqual({
      database: 'not_configured',
      paypal: 'configured',
      ai: 'not_configured',
    })
    expect(text).not.toContain('secret-value')
    expect(text).not.toContain('id-value')
  })

  it('sets security headers and a request id', async () => {
    const response = await make().request('/api/health')

    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-request-id')).toMatch(/^[\w-]{8,64}$/)
    expect(response.headers.get('ratelimit-limit')).toBe('240')
  })
})

describe('request ids', () => {
  it('keeps a sane id from the caller', async () => {
    const response = await make().request('/api/health', { headers: { 'x-request-id': 'trace-12345678' } })
    expect(response.headers.get('x-request-id')).toBe('trace-12345678')
  })

  it('replaces an unsafe id', async () => {
    const response = await make().request('/api/health', { headers: { 'x-request-id': 'bad id\twith spaces' } })
    expect(response.headers.get('x-request-id')).not.toContain(' ')
    expect(response.headers.get('x-request-id')).toMatch(/^[\w-]{8,64}$/)
  })
})

describe('unknown paths', () => {
  it('answer a JSON 404 under /api, with the request id', async () => {
    const response = await make().request('/api/nothing-here')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toMatchObject({ code: 'not_found', requestId: response.headers.get('x-request-id') })
  })

  it('answer a JSON 404 outside /api when the web app is not served', async () => {
    const response = await make().request('/somewhere')
    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('not_found')
  })
})

describe('limits and origins', () => {
  it('rejects a body over 1 MB', async () => {
    const response = await make().request('/api/health', { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) })
    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe('payload_too_large')
  })

  it('allows the web app origin in development and refuses others', async () => {
    const app = make()
    const allowed = await app.request('/api/health', { headers: { origin: 'http://localhost:5173' } })
    const refused = await app.request('/api/health', { headers: { origin: 'https://evil.example' } })

    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('only allows the configured app origin in production', async () => {
    const app = make({ NODE_ENV: 'production', APP_URL: 'https://bridge.example.com' })
    const dev = await app.request('/api/health', { headers: { origin: 'http://localhost:5173' } })
    const real = await app.request('/api/health', { headers: { origin: 'https://bridge.example.com' } })

    expect(dev.headers.get('access-control-allow-origin')).toBeNull()
    expect(real.headers.get('access-control-allow-origin')).toBe('https://bridge.example.com')
  })
})
