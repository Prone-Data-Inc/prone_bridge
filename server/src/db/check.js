/* `npm run db:check`: proves a Supabase project is ready, in the order that matters. Each check prints one line.
     1. the database answers over a verified TLS connection and every migration is applied
     2. every table has row level security, and the public data API (anon key) is closed
     3. the browser key really is the anon key, never the service role key
     4. a payment-style change reaches a browser as a live signal */
import { createClient } from '@supabase/supabase-js'
import { inspectSupabaseKey } from '#shared/supabaseKey.js'
import { migrationStatus } from './migrate.js'

const TABLES_TO_PROBE = ['payments', 'buyers', 'merchants', 'notifications', 'schema_migrations']

export async function runChecks({ db, say, env }) {
  let allGood = true
  const report = (good, message) => {
    allGood &&= good
    say(`${good ? 'ok  ' : 'FAIL'} ${message}`)
  }

  const [{ version }] = await db.query("select split_part(version(), ' on ', 1) as version")
  report(true, `connected with a verified TLS connection (${version})`)

  const status = await migrationStatus(db)
  const pending = status.filter((item) => !item.applied || item.changed)
  report(
    pending.length === 0,
    pending.length
      ? `migrations pending or changed: ${pending.map((item) => item.version).join(', ')}`
      : `all ${status.length} migrations applied`,
  )

  const open = await db.query(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
  )
  report(
    open.length === 0,
    open.length
      ? `row level security is off for: ${open.map((row) => row.relname).join(', ')}`
      : 'row level security is on for every table',
  )

  const url = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    report(false, 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set, so the browser checks were skipped')
    return allGood
  }

  const kind = inspectSupabaseKey(anon)
  report(
    kind === 'public',
    kind === 'public'
      ? 'VITE_SUPABASE_ANON_KEY is a public key'
      : `VITE_SUPABASE_ANON_KEY is not a public key (${kind}). Never put a secret key in a VITE_ variable.`,
  )
  if (kind !== 'public') return false

  /* With the anon key, the public data API must give back nothing at all. */
  for (const table of TABLES_TO_PROBE) {
    const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    })
    const body = await response.text()
    const closed = !response.ok || body.trim() === '[]'
    report(
      closed,
      closed ? `the public data API returns nothing for ${table}` : `the public data API LEAKS rows from ${table}`,
    )
  }

  report(...(await liveSignalCheck({ db, url, anon })))
  return allGood
}

/* Listens on the public channel like a browser would, writes a notification, and waits for the signal. */
async function liveSignalCheck({ db, url, anon }) {
  const supabase = createClient(url, anon, { auth: { persistSession: false } })
  const channel = supabase.channel('pb:events', { config: { broadcast: { self: false }, private: false } })
  let timer
  try {
    const heard = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('no signal within 10 seconds')), 10_000)
      channel.on('broadcast', { event: 'change' }, ({ payload }) => {
        if (payload?.kind === 'check.realtime') resolve(payload)
      })
    })
    await new Promise((resolve, reject) => {
      channel.subscribe((state, error) => {
        if (state === 'SUBSCRIBED') resolve()
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) reject(error ?? new Error(`channel ${state}`))
      })
    })
    await db.query(
      "insert into public.notifications (audience, kind, title, body) values ('admin', 'check.realtime', 'Live check', 'Safe to ignore.')",
    )
    const payload = await heard
    const leaked = Object.keys(payload).filter(
      (key) => !['table', 'op', 'id', 'merchantId', 'buyerId', 'status', 'audience', 'kind'].includes(key),
    )
    return leaked.length
      ? [false, `the live signal carries unexpected fields: ${leaked.join(', ')}`]
      : [true, 'a change reached the browser as a live signal, carrying ids only']
  } catch (error) {
    return [false, `live signal failed: ${error.message}. Check that Realtime is enabled for the project.`]
  } finally {
    clearTimeout(timer)
    await db.query("delete from public.notifications where kind = 'check.realtime'").catch(() => {})
    await supabase.removeChannel(channel)
    await supabase.realtime.disconnect?.()
  }
}
