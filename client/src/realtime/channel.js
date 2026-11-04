/* Live signals in the browser. The database broadcasts a small signal on the public channel "pb:events" whenever a
   payment, a notification or a payout changes: { table, op, id, merchantId, buyerId, status, audience, kind }.
   It carries ids only, so the screens refetch details through the API. Only the public (anon) key is ever used here. */
import { createClient } from '@supabase/supabase-js'
import { inspectSupabaseKey } from '#shared/supabaseKey.js'

export const CHANNEL = 'pb:events'

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

  const supabase = makeClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
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
