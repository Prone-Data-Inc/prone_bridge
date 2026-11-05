/* When anyone resets the demo, every open copy of the app starts again from the fresh data: the buyer remembered in this
   browser may no longer exist, and the pages show old numbers. The server sends one signal, { table: 'demo', op: 'RESET' }. */
import { useEffect } from 'react'
import { reloadApp } from '@/lib/reload.js'
import { onSignal } from '@/realtime/bus.js'
import { useSession } from '@/stores/session.js'
import { toast } from '@/stores/toasts.js'

export const RELOAD_DELAY_MS = 1500

export function useResetWatcher() {
  useEffect(() => {
    let timer
    const stop = onSignal((signal) => {
      if (signal.table !== 'demo' || signal.op !== 'RESET' || timer) return
      toast('The demo was reset. Loading the fresh data.', { tone: 'warning' })
      useSession.getState().forgetBuyer()
      timer = setTimeout(reloadApp, RELOAD_DELAY_MS)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [])
}
