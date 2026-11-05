/* The security pass, as tests. What is checked here is what an attacker, or a mistake, could reach: the headers and the
   content security policy, files outside the web app, injected text in every search, secrets in responses and logs, a
   spoofed address, another website calling the API, and errors that say too much. Real routes on an in-memory Postgres. */
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { CSP, OPENER_POLICY } from './lib/csp.js'
import { createLogger } from './lib/logger.js'
import { mountClient } from './static.js'

const silent = createLogger({ level: 'silent' })
/* Fake keys, built at run time so this file holds nothing shaped like a secret. */
const FAKE = {
  openai: ['fake', 'openai', 'key', randomUUID()].join('-'),
  secret: ['fake', 'paypal', 'secret', randomUUID()].join('-'),
  webhook: ['fake', 'webhook', randomUUID()].join('-'),
}
const env = loadEnv({
  NODE_ENV: 'test',
  OPENAI_API_KEY: FAKE.openai,
  PAYPAL_CLIENT_ID: 'fake-client-id',
  PAYPAL_CLIENT_SECRET: FAKE.secret,
  PAYPAL_WEBHOOK_ID: FAKE.webhook,
})

describe('content security policy', () => {
  const directives = Object.fromEntries(CSP.split('; ').map((part) => [part.split(' ')[0], part.split(' ').slice(1)]))

  it('lets the app load only itself, PayPal and Supabase', () => {
    const outside = Object.values(directives)
      .flat()
      .filter((source) => /^(https?|wss?):/.test(source))
    expect(outside.length).toBeGreaterThan(3)
    for (const source of outside) {
      expect(source, source).toMatch(
        /^(https:\/\/\*\.(paypal\.com|paypalobjects\.com|supabase\.co)|wss:\/\/\*\.supabase\.co)$/,
      )
    }
  })

  it('allows no inline or evaluated script, no plugins, and no framing of the app', () => {
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).not.toContain("'unsafe-inline'")
    expect(CSP).not.toContain("'unsafe-eval'")
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
    expect(directives['form-action']).toEqual(["'self'"])
  })

  it('lets only PayPal be framed (the card fields), and nothing else', () => {
    expect(directives['frame-src'].every((source) => /paypal/.test(source))).toBe(true)
  })

  it('is the same text in vercel.json, which serves the app on Vercel, as the Node server sends', () => {
    const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    const headers = Object.fromEntries(
      config.headers.find((entry) => entry.source === '/(.*)').headers.map((h) => [h.key, h.value]),
    )
    expect(headers['Content-Security-Policy']).toBe(CSP)
    expect(headers['Cross-Origin-Opener-Policy']).toBe(OPENER_POLICY)
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBeTruthy()
    expect(headers['Permissions-Policy']).toContain('camera=()')
  })

  it('is a page with no inline script, which the policy would block (the theme script is a file of its own)', () => {
    const page = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8')
    const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map((match) => match[0])
    expect(scripts.length).toBeGreaterThan(1)
    for (const tag of scripts) expect(tag).toMatch(/\ssrc="/)
    expect(page).not.toMatch(/\son[a-z]+=/i)
    expect(page).not.toMatch(/javascript:/i)
    expect(readFileSync(new URL('../../client/public/theme.js', import.meta.url), 'utf8')).toContain("'pb.theme'")
  })

  it('leaves the API function room to finish a long scenario', () => {
    const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    expect(config.functions['api/index.js'].maxDuration).toBeGreaterThanOrEqual(30)
  })
})

describe('the web app served by this server', () => {
  let dist
  let secretName
  let outside

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'pronebridge-secure-'))
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ProneBridge</title>')
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
    secretName = `pb-secret-${randomUUID()}.txt`
    outside = join(dist, '..', secretName)
    writeFileSync(outside, 'TOP SECRET CONTENTS')
  })
  afterAll(() => {
    rmSync(dist, { recursive: true, force: true })
    rmSync(outside, { force: true })
  })

  const serve = () => {
    const app = new Hono()
    mountClient(app, { dist, logger: silent })
    return app
  }

  it('sends the policy and the opener policy with the page, the files and the fallback', async () => {
    const app = serve()
    for (const path of ['/', '/assets/app-abc123.js', '/seller/payments']) {
      const response = await app.request(path)
      expect(response.headers.get('content-security-policy'), path).toBe(CSP)
      expect(response.headers.get('cross-origin-opener-policy'), path).toBe(OPENER_POLICY)
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
    }
  })

  it('never hands out a file outside the web app, however the path is written', async () => {
    const app = serve()
    const attempts = [
      `/../${secretName}`,
      `/%2e%2e/${secretName}`,
      `/..%2f${secretName}`,
      `/assets/../../${secretName}`,
      `/assets/%2e%2e/%2e%2e/${secretName}`,
      `/%2e%2e%2f${secretName}`,
      `/....//${secretName}`,
      `//${secretName}`,
      '/assets/..\\..\\' + secretName,
    ]
    for (const path of attempts) {
      const response = await app.request(path)
      expect(await response.text(), path).not.toContain('TOP SECRET')
    }
  })
})

describe('the API under attack', () => {
  let db
  let app
  let lines
  let calls = 0

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    lines = []
    const logger = createLogger({ level: 'debug', write: (_level, line) => lines.push(line) })
    const openai = { enabled: true, models: { agent: 'a', fast: 'f' }, respond: vi.fn() }
    app = createApp({ env, logger, db, openai })
  }, 60_000)
  afterAll(() => db.close())

  const request = async (path, init = {}) => {
    calls += 1
    const headers = { ...init.headers, 'x-forwarded-for': `10.7.${calls >> 8}.${calls & 255}` }
    const response = await app.request(path, { ...init, headers })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    return { status: response.status, headers: response.headers, text, body }
  }
  const json = (method, path, body) =>
    request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const count = async (table) => (await db.query(`select count(*)::int as n from public.${table}`))[0].n

  describe('injected text in every search and filter', () => {
    const PAYLOADS = [
      "' or 1=1 --",
      "'; drop table public.payments; --",
      '" or ""="',
      '%',
      '_',
      'p_',
      '\\',
      '%27%20OR%20%271%27%3D%271',
      "admin'/*",
      '<script>alert(1)</script>',
      '${7*7}',
      '\u0000',
      'a'.repeat(79),
    ]
    const SEARCHES = [
      (q) => `/api/seller/payments?q=${encodeURIComponent(q)}`,
      (q) => `/api/seller/customers?q=${encodeURIComponent(q)}`,
      (q) => `/api/admin/transactions?q=${encodeURIComponent(q)}`,
      (q) => `/api/admin/audit?q=${encodeURIComponent(q)}`,
    ]

    it('is answered as plain text to look for: never an error from the database, never more than was asked for', async () => {
      const payments = await count('payments')
      const audit = await count('audit_log')
      for (const search of SEARCHES) {
        for (const payload of PAYLOADS) {
          const { status, body } = await request(search(payload))
          expect([200, 400], `${search('x')} with ${payload}`).toContain(status)
          if (status === 200 && ['%', 'p_', '\\'].includes(payload)) {
            const rows = body.data.payments ?? body.data.customers ?? body.data.entries
            /* % and _ are looked for as themselves, never as wildcards: nothing holds "%", "\" or a p followed by an
               underscore (references read pb_..., so "p_" would match every one of them if _ meant any character) */
            expect(rows.length, `${search('x')} with ${payload}`).toBe(0)
          }
        }
      }
      expect(await count('payments')).toBe(payments)
      expect(await count('audit_log')).toBe(audit)
    })

    it('stops a seller name made of SQL before it reaches a query', async () => {
      for (const merchant of ["pdl'; drop table public.merchants; --", 'pdl OR 1=1', '../etc/passwd', 'PDL']) {
        const { status } = await request(`/api/seller/overview?merchant=${encodeURIComponent(merchant)}`)
        expect(status, merchant).toBe(400)
      }
      expect(await count('merchants')).toBe(5)
    })

    it('stops ids, countries, methods and statuses that are not what they should be', async () => {
      const bad = [
        '/api/seller/payments/1%20or%201=1',
        '/api/admin/transactions/abc',
        '/api/admin/transactions?status=succeeded%27--',
        '/api/admin/transactions?country=CI%27',
        '/api/admin/transactions?method=card%3Bselect',
        '/api/admin/transactions?sort=amount;drop',
        '/api/checkout/match?country=CI%27',
      ]
      for (const path of bad) expect((await request(path)).status, path).toBe(400)
    })

    it('stores a buyer name made of markup as plain text, and never as anything that runs', async () => {
      const name = '<img src=x onerror=alert(1)> Aminata'
      const made = await json('POST', '/api/checkout/payments', {
        idempotencyKey: randomUUID(),
        product: 'ai-for-work',
        country: 'CI',
        method: 'mobile_money',
        buyer: { name, email: `markup.${randomUUID().slice(0, 8)}@example.com` },
      })
      expect(made.status).toBe(201)
      const listed = await request('/api/seller/payments?q=onerror')
      expect(listed.body.data.payments[0].buyer.name).toBe(name)
      /* JSON, never HTML, whatever the name says */
      expect(listed.headers.get('content-type')).toMatch(/application\/json/)
      expect(listed.headers.get('x-content-type-options')).toBe('nosniff')
    })
  })

  describe('a request that is not what the app sends', () => {
    it('is not read at all unless it says it is JSON, so another website cannot send one without asking first', async () => {
      const routes = [
        ['POST', '/api/checkout/payments'],
        ['POST', '/api/copilot/ask'],
        ['POST', '/api/seller/links'],
        ['POST', '/api/admin/settlements/run'],
        ['POST', '/api/admin/fairness/probe'],
        ['POST', '/api/demo/reset'],
        ['POST', `/api/admin/review/${randomUUID()}/approve`],
        ['PATCH', '/api/admin/corridors/CI/methods/card'],
      ]
      for (const [method, path] of routes) {
        for (const type of [
          'text/plain',
          'application/x-www-form-urlencoded',
          'multipart/form-data; boundary=x',
          undefined,
        ]) {
          const { status } = await request(path, {
            method,
            headers: type ? { 'Content-Type': type } : {},
            body: '{"confirm":true}',
          })
          expect(status, `${method} ${path} as ${type}`).toBe(415)
        }
      }
    })

    it('is refused when a text holds a NUL character, which the database cannot keep', async () => {
      const nul = String.fromCharCode(0)
      const made = await json('POST', '/api/checkout/payments', {
        idempotencyKey: randomUUID(),
        product: 'ai-for-work',
        country: 'CI',
        method: 'mobile_money',
        buyer: { name: `Aminata${nul}`, email: 'nul.test@example.com' },
      })
      expect(made.status).toBe(400)
      const asked = await json('POST', '/api/copilot/ask', { messages: [{ role: 'user', content: `Hi${nul}` }] })
      expect(asked.status).toBe(400)
    })

    it('is refused when it is too large', async () => {
      const big = await json('POST', '/api/copilot/ask', {
        messages: [{ role: 'user', content: 'x'.repeat(1_100_000) }],
      })
      expect(big.status).toBe(413)
    })

    it('does not let another website read the answers', async () => {
      const foreign = await request('/api/seller/overview', { headers: { Origin: 'https://evil.example' } })
      expect(foreign.headers.get('access-control-allow-origin')).toBeNull()
      const home = await request('/api/seller/overview', { headers: { Origin: env.appUrl } })
      expect(home.headers.get('access-control-allow-origin')).toBe(env.appUrl)
      const preflight = await request('/api/admin/review/x/approve', {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
      })
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
    })

    it('answers a wrong method or an unknown path in JSON, without a file listing or a stack', async () => {
      for (const [method, path] of [
        ['DELETE', '/api/admin/overview'],
        ['GET', '/api/nope'],
        ['PUT', '/api/seller/links'],
        ['GET', '/api/../.env'],
      ]) {
        const { status, body, text } = await request(path, { method })
        expect([404, 405], `${method} ${path}`).toContain(status)
        expect(body?.error?.code, `${method} ${path}`).toBeTruthy()
        expect(text).not.toMatch(/node_modules|at \w+ \(|C:\\/)
      }
    })
  })

  describe('secrets', () => {
    it('never appear in the answer of any route that reads', async () => {
      const sample = (path) =>
        path
          .replace(':id', randomUUID())
          .replace(':country', 'CI')
          .replace(':method', 'mobile_money')
          .replace(':code', 'k7m3q9x2')
          .replace(/:\w+/g, 'x')
      const reads = [
        ...new Set(
          app.routes
            .filter((route) => route.method === 'GET' && route.path.startsWith('/api'))
            .map((route) => sample(route.path)),
        ),
      ]
      expect(reads.length).toBeGreaterThan(30)
      for (const path of reads) {
        const { text } = await request(path.includes('*') ? '/api/health' : path)
        for (const [name, value] of Object.entries(FAKE)) expect(text, `${path} leaked ${name}`).not.toContain(value)
        expect(text, path).not.toContain(env.paypal.clientSecret)
      }
    })

    it('say only whether each service is connected, never what the connection is', async () => {
      const { body } = await request('/api/health')
      expect(body.data.integrations).toEqual({ database: 'connected', paypal: 'configured', ai: 'configured' })
      expect(JSON.stringify(body)).not.toMatch(/postgres|supabase|sk-/i)
    })

    it('are not written to the log, and neither is what a buyer typed or a query string', async () => {
      const email = `private.${randomUUID().slice(0, 8)}@example.com`
      lines.length = 0
      await json('POST', '/api/checkout/payments', {
        idempotencyKey: randomUUID(),
        product: 'ai-for-work',
        country: 'CI',
        method: 'mobile_money',
        buyer: { name: 'Private Person', email },
      })
      await request(`/api/seller/customers?q=${encodeURIComponent(email)}`)
      await request('/api/copilot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer top-secret-token' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'my password is hunter2' }] }),
      })
      const log = lines.join('\n')
      expect(log.length).toBeGreaterThan(100)
      for (const secret of [email, 'Private Person', 'hunter2', 'top-secret-token', ...Object.values(FAKE)])
        expect(log).not.toContain(secret)
    })
  })

  describe('errors', () => {
    it('say nothing about the database when it fails', async () => {
      const failing = {
        query: async () => {
          throw new Error('select * from secrets where password = hunter2 at db.internal:5432')
        },
        tx: async () => {
          throw new Error('connection to db.internal:5432 refused, password hunter2')
        },
        exec: async () => {},
        close: async () => {},
      }
      const broken = createApp({ env, logger: silent, db: failing })
      for (const path of [
        '/api/seller/overview',
        '/api/admin/overview',
        '/api/checkout/match?country=CI',
        '/api/demo/state',
      ]) {
        const response = await broken.request(path, { headers: { 'x-forwarded-for': '10.99.0.1' } })
        const text = await response.text()
        expect(response.status, path).toBeGreaterThanOrEqual(500)
        expect(text, path).not.toMatch(/hunter2|db\.internal|select \*|secrets/)
        expect(JSON.parse(text).error.message, path).toBe('Something went wrong. Try again.')
      }
    })
  })

  describe('a spoofed address', () => {
    it('does not buy a new rate limit outside Vercel: the connection is the address, whatever the header says', async () => {
      const exposed = createApp({
        env: loadEnv({ NODE_ENV: 'development' }),
        logger: silent,
        db,
        openai: { enabled: true, models: { agent: 'a', fast: 'f' }, respond: vi.fn() },
      })
      const statuses = []
      for (let index = 0; index < 17; index += 1) {
        const response = await exposed.request('/api/copilot/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `203.0.113.${index + 1}` },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
        })
        statuses.push(response.status)
      }
      /* 15 are allowed a minute, however the header changes */
      expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(2)
    })

    it('is believed where a trusted proxy wrote it, as on Vercel', () => {
      expect(loadEnv({ NODE_ENV: 'production', VERCEL: '1' }).trustProxy).toBe(true)
      expect(loadEnv({ NODE_ENV: 'production' }).trustProxy).toBe(false)
      expect(loadEnv({ NODE_ENV: 'development' }).trustProxy).toBe(false)
      expect(loadEnv({ NODE_ENV: 'production', TRUST_PROXY: 'true' }).trustProxy).toBe(true)
      expect(loadEnv({ NODE_ENV: 'production', VERCEL: '1', TRUST_PROXY: 'false' }).trustProxy).toBe(false)
    })
  })
})
