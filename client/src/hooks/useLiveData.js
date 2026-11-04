/* Starts everything that keeps the app live, once, at the root: the address bar router, the theme, the live connection
   and the notifications. When the live connection is not up (blocked network, no keys), it falls back to checking every
   twenty seconds, and it checks again whenever the window comes back into view. */
import { useEffect } from 'react'
import { startNavigation, useNav } from '@/stores/nav.js'
import { startNotifications, useNotifications } from '@/stores/notifications.js'
import { startRealtime, useRealtime } from '@/stores/realtime.js'
import { startTheme } from '@/stores/theme.js'
import { tabById } from '@/config/tabs.js'

const FALLBACK_MS = 20_000

export function useLiveData() {
  const tab = useNav((state) => state.tab)
  const status = useRealtime((state) => state.status)

  useEffect(() => {
    const stops = [startTheme(), startNavigation(), startRealtime(), startNotifications()]
    return () => stops.forEach((stop) => stop())
  }, [])

  /* Opening a tab shows its notifications at once. */
  useEffect(() => {
    const audience = tabById(tab)?.audience
    if (audience) useNotifications.getState().load(audience)
  }, [tab])

  useEffect(() => {
    const refresh = () => {
      const audience = tabById(useNav.getState().tab)?.audience
      const { loadSummary, load } = useNotifications.getState()
      loadSummary()
      if (audience) load(audience, { announce: true })
    }
    const timer = status === 'live' ? null : setInterval(refresh, FALLBACK_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status])
}
