import { useSyncExternalStore } from 'react'

/* True while the media query matches, e.g. useMediaQuery('(max-width: 1023px)'). */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
