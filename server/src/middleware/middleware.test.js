import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'
import { badRequest, conflict } from '#server/lib/errors.js'
import { createLogger } from '#server/lib/logger.js'
import { createErrorHandler, notFoundHandler } from './errorHandler.js'
import { rateLimit } from './rateLimit.js'
import { requestContext } from './requestContext.js'

const silent = createLogger({ level: 'silent' })

describe('error handler', () => {
  function appThatThrows(error) {
    const app = new Hono()
    app.use('*', requestContext({ logger: silent }))
    app.get('/boom', () => {
      throw error
    })
    app.onError(createErrorHandler({ logger: silent }))
    app.notFound(notFoundHandler)
    return app
  }

  it('keeps the status, code and message of a known error', async () => {
    const response = await appThatThrows(conflict('Already paid.')).request('/boom')
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatchObject({ code: 'conflict', message: 'Already paid.' })
  })

  it('carries details of a bad request', async () => {
    const response = await appThatThrows(badRequest('Check the amount.', { field: 'amount' })).request('/boom')
    expect(response.status).toBe(400)
    expect((await response.json()).error.details).toEqual({ field: 'amount' })
  })

  it('maps framework HTTP exceptions below 500', async () => {
    const response = await appThatThrows(new HTTPException(415, { message: 'Send JSON.' })).request('/boom')
    expect(response.status).toBe(415)
    expect((await response.json()).error).toMatchObject({ code: 'unsupported_media_type', message: 'Send JSON.' })
  })

  it('hides the details of an unexpected failure and logs it', async () => {
    const lines = []
    const logger = createLogger({ level: 'error', json: true, write: (_name, line) => lines.push(line) })
    const app = new Hono()
    app.get('/boom', () => {
      throw new Error('database password is hunter2')
    })
    app.onError(createErrorHandler({ logger }))

    const response = await app.request('/boom')
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text).error.code).toBe('internal_error')
    expect(text).not.toContain('hunter2')
    expect(lines.join('')).toContain('hunter2')
  })
})

describe('rate limit', () => {
  function limited({ max = 2, windowMs = 1000, clock }) {
    const app = new Hono()
    app.use('*', rateLimit({ max, windowMs, now: () => clock.time }))
    app.get('/', (c) => c.text('ok'))
    app.onError(createErrorHandler({ logger: silent }))
    return app
  }
  const from = (ip) => ({ headers: { 'x-forwarded-for': ip } })

  it('answers 429 with Retry-After once the limit is passed', async () => {
    const app = limited({ clock: { time: 0 } })
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200)
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200)

    const blocked = await app.request('/', from('1.1.1.1'))
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe('1')
    expect((await blocked.json()).error.code).toBe('rate_limited')
  })

  it('counts each caller on its own', async () => {
    const app = limited({ max: 1, clock: { time: 0 } })
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200)
    expect((await app.request('/', from('2.2.2.2'))).status).toBe(200)
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(429)
  })

  it('starts a new window after the time has passed', async () => {
    const clock = { time: 0 }
    const app = limited({ max: 1, clock })
    await app.request('/', from('1.1.1.1'))
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(429)

    clock.time = 1001
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200)
  })

  it('reports what is left', async () => {
    const app = limited({ max: 3, clock: { time: 0 } })
    const response = await app.request('/', from('1.1.1.1'))
    expect(response.headers.get('ratelimit-limit')).toBe('3')
    expect(response.headers.get('ratelimit-remaining')).toBe('2')
  })
})
