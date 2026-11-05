/* The whole product in one test process: the real React app, the real API and a real Postgres (in memory), with nothing in
   between that is pretended. The browser's fetch is routed straight into the API, so every screen talks to the real
   routes, real validation and real SQL. The database's live signals (the ones Supabase broadcasts to browsers) are read
   from the table the test database records them in, and handed to the app, so live updates work as they do for real.
   Only the outside world is replaced: PayPal and OpenAI are stand-ins, and PayPal is off. */
import { vi } from 'vitest'
import { emitSignal } from '@/realtime/bus.js'
import { useCatalog } from '@/stores/catalog.js'
import { useCopilot } from '@/stores/copilot.js'
import { useLearner } from '@/stores/learner.js'
import { useNav } from '@/stores/nav.js'
import { useNotifications } from '@/stores/notifications.js'
import { usePaypal } from '@/stores/paypal.js'
import { useSession } from '@/stores/session.js'
import { useToasts } from '@/stores/toasts.js'
import { createApp } from '../../server/src/app.js'
import { loadEnv } from '../../server/src/config/env.js'
import { migrate } from '../../server/src/db/migrate.js'
import { applySeed } from '../../server/src/db/seed/apply.js'
import { buildSeed } from '../../server/src/db/seed/build.js'
import { createTestDb } from '../../server/src/db/testing.js'
import { createLogger } from '../../server/src/lib/logger.js'
import { createRiskService } from '../../server/src/services/risk.service.js'

const SIGNAL_EVERY_MS = 120

/* What the AI answers when asked for a note about a held payment. */
export const aiNote = (explanation = 'The signals suggest a throwaway email address was used.') => ({
  text: JSON.stringify({ explanation }),
  parsed: { explanation },
  refusal: null,
  calls: [],
  output: [],
  usage: { inputTokens: 120, outputTokens: 30 },
  status: 'completed',
  incomplete: null,
  model: 'fast-model',
})

/* seed: false starts with a migrated database and nothing in it, like a brand new installation. */
export async function startStack({ seed = true } = {}) {
  /* The developer's .env has real Supabase keys for the browser. The test must never connect to them. */
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

  const db = await createTestDb()
  await migrate(db)
  if (seed) {
    await applySeed(db, buildSeed({ now: new Date() }))
    await createRiskService({ db, ai: { enabled: false } }).scoreHistory()
  }

  const openai = {
    enabled: true,
    models: { agent: 'agent-model', fast: 'fast-model' },
    respond: vi.fn(async () => aiNote()),
  }
  const paypal = {
    enabled: false,
    clientToken: vi.fn(),
    createOrder: vi.fn(),
    captureOrder: vi.fn(),
    getOrder: vi.fn(),
    verifyWebhook: vi.fn(),
    createPayout: vi.fn(),
    getPayout: vi.fn(),
  }
  const env = loadEnv({ NODE_ENV: 'test', OPENAI_API_KEY: ['test', 'key'].join('-') })
  const app = createApp({ env, logger: createLogger({ level: 'silent' }), db, paypal, openai })

  /* The browser's fetch goes straight to the API. Each call comes from its own address, so no rate limit gets in the way. */
  let calls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost')
      const headers = new Headers(init.headers)
      calls += 1
      headers.set('x-forwarded-for', `10.${(calls >> 16) & 255}.${(calls >> 8) & 255}.${calls & 255}`)
      return app.request(url.pathname + url.search, { ...init, headers })
    }),
  )

  /* The live signals: whatever the database broadcast since the last look goes to the app. */
  let seen = 0
  const rows = await db.query('select coalesce(max(id), 0)::int as last from realtime.sent')
  seen = rows[0].last
  let busy = false
  const timer = setInterval(async () => {
    if (busy) return
    busy = true
    try {
      const sent = await db.query('select id, payload from realtime.sent where id > $1 order by id', [seen])
      for (const row of sent) {
        seen = Number(row.id)
        emitSignal(row.payload)
      }
    } catch {
      /* the database is closing */
    } finally {
      busy = false
    }
  }, SIGNAL_EVERY_MS)

  return {
    db,
    app,
    openai,
    one: async (sql, params) => (await db.query(sql, params))[0],
    count: async (table, where = 'true', params = []) =>
      (await db.query(`select count(*)::int as n from public.${table} where ${where}`, params))[0].n,
    /* Recent payments are aged by a day, as time would, so one test's burst never colours the next. */
    calm: () =>
      db.query(
        "update public.payments set created_at = created_at - interval '1 day' where created_at > now() - interval '10 minutes'",
      ),
    async stop() {
      clearInterval(timer)
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
      await db.close()
    },
  }
}

/* A browser that has just been opened: no address, no remembered buyer, nothing loaded. */
export function resetClient() {
  window.localStorage.clear()
  window.location.hash = ''
  useSession.setState({ merchant: 'pdl', buyer: null })
  useCatalog.setState({ status: 'idle', error: null, merchant: null, products: [], countries: [] })
  useLearner.setState({ courses: [], loaded: false, error: null })
  useCopilot.setState({ status: null, statusError: null, turns: [], asking: false, waiting: [] })
  usePaypal.setState({ status: 'idle', available: false })
  useToasts.setState({ items: [] })
  useNotifications.setState({
    items: { buyer: [], seller: [], admin: [] },
    unread: { buyer: 0, seller: 0, admin: 0 },
    loaded: { buyer: false, seller: false, admin: false },
    error: null,
  })
  useNav.setState({
    view: 'app',
    tab: 'buyer',
    section: 'home',
    param: null,
    sections: { buyer: 'home', seller: 'home', admin: 'overview' },
    params: { buyer: null, seller: null, admin: null },
    visited: {},
    drawer: false,
  })
}
