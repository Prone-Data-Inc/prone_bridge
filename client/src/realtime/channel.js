/* Live signals in the browser. The database broadcasts a small signal on the public channel "pb:events" whenever a
   payment, a notification or a payout changes: { table, op, id, merchantId, buyerId, status, audience, kind }.
   It carries ids only, so the screens refetch details through the API. Only the public (anon) key is ever used here. */
import { createClient } from '@supabase/supabase-js'
import { inspectSupabaseKey } from '#shared/supabaseKey.js'

export const CHANNEL = 'pb:events'

const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }

/* One client per project for the whole page, however many times the app starts and stops (React does it twice in development). */
const shared = new Map()
function clientFor(url, anonKey, make) {
  if (make !== createClient) return make(url, anonKey, OPTIONS)
  const key = `${url}|${anonKey}`
  if (!shared.has(key)) shared.set(key, make(url, anonKey, OPTIONS))
  return shared.get(key)
}

const STATUS = { SUBSCRIBED: 'live', CLOSED: 'closed', CHANNEL_ERROR: 'error', TIMED_OUT: 'error' }

/* Returns { close }. status is 'off' (no keys), 'connecting', 'live', 'closed' or 'error'. */
export function connectRealtime({ url, anonKey, onSignal, onStatus, makeClient = createClient }) {
  if (!url || !anonKey) {
    onStatus?.('off')
    return { close() {} }
  }
  if (inspectSupabaseKey(anonKey) === 'secret') {
    throw new Error('A secret Supabase key was given to the browser. Use the anon key.')
  }

  const supabase = clientFor(url, anonKey, makeClient)
  const channel = supabase.channel(CHANNEL, { config: { broadcast: { self: false }, private: false } })
  channel.on('broadcast', { event: 'change' }, ({ payload }) => onSignal(payload))
  onStatus?.('connecting')
  channel.subscribe((state) => onStatus?.(STATUS[state] ?? 'connecting'))

  return {
    close() {
      supabase.removeChannel(channel)
    },
  }
}
