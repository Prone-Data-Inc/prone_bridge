import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogger } from '#server/lib/logger.js'
import { mountClient } from './static.js'

describe('mountClient', () => {
  let dist

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'pronebridge-dist-'))
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ProneBridge</title>')
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
    writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  })

  afterAll(() => rmSync(dist, { recursive: true, force: true }))

  const make = () => {
    const app = new Hono()
    app.get('/api/ping', (c) => c.json({ ok: true }))
    mountClient(app, { dist, logger: createLogger({ level: 'silent' }) })
    return app
  }

  it('serves files, caching hashed assets for a year', async () => {
    const response = await make().request('/assets/app-abc123.js')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('serves index.html at the root and never caches it', async () => {
    const response = await make().request('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('ProneBridge')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('sets security headers on pages and files', async () => {
    const response = await make().request('/')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBeTruthy()
  })

  it('falls back to index.html for any other page', async () => {
    const response = await make().request('/seller/payments')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('ProneBridge')
  })

  it('leaves API routes alone', async () => {
    const response = await make().request('/api/ping')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('does nothing when the build is missing', async () => {
    const app = new Hono()
    mountClient(app, { dist: join(dist, 'missing'), logger: createLogger({ level: 'silent' }) })
    expect((await app.request('/')).status).toBe(404)
  })
})
