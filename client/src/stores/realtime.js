/* The state of the live connection: 'off' (no keys), 'connecting', 'live', 'closed' or 'error'. */
import { create } from 'zustand'
import { connectRealtime } from '@/realtime/channel.js'
import { emitSignal } from '@/realtime/bus.js'

export const useRealtime = create(() => ({ status: 'connecting' }))

/* Opens the connection from the browser-safe settings. Returns the stop function. */
export function startRealtime({
  url = import.meta.env.VITE_SUPABASE_URL,
  anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
} = {}) {
  try {
    const connection = connectRealtime({
      url,
      anonKey,
      onSignal: emitSignal,
      onStatus: (status) => useRealtime.setState({ status }),
    })
    return () => connection.close()
  } catch {
    useRealtime.setState({ status: 'error' })
    return () => {}
  }
}
