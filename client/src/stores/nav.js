/* Which tab and which page are open. The address bar is the source of truth (#/seller/payments), so the browser's back
   and forward buttons work and a link opens exactly where it was copied. Each tab remembers its own page, like browser
   tabs do. #/ui opens the design system gallery. */
import { create } from 'zustand'
import { DEFAULT_TAB, TABS, sectionOf, tabById } from '@/config/tabs.js'

const firstSection = (tabId) => tabById(tabId).sections[0].id

const initialSections = () => Object.fromEntries(TABS.map((tab) => [tab.id, firstSection(tab.id)]))

/* '#/seller/payments' -> { view: 'app', tab: 'seller', section: 'payments' }. Unknown paths fall back to a valid page. */
export function parseHash(hash = '') {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'ui') return { view: 'ui', tab: null, section: null }
  const tab = tabById(parts[0]) ? parts[0] : DEFAULT_TAB
  const section = sectionOf(tab, parts[1]) ? parts[1] : firstSection(tab)
  return { view: 'app', tab, section }
}

export const hashFor = (tab, section) => `#/${tab}/${section}`

const read = () => (typeof window === 'undefined' ? parseHash('') : parseHash(window.location.hash))

export const useNav = create((set, get) => {
  const start = read()
  return {
    ...start,
    sections: { ...initialSections(), ...(start.tab ? { [start.tab]: start.section } : {}) },
    drawer: false,

    /* Called when the address changes. */
    sync(hash) {
      const next = parseHash(hash)
      set((state) => ({
        ...next,
        sections: next.tab ? { ...state.sections, [next.tab]: next.section } : state.sections,
        drawer: false,
      }))
    },

    /* Open a tab (at the page it was last on) or a page of a tab. The address bar changes, then sync runs. */
    go(tab, section) {
      const target = section ?? get().sections[tab] ?? firstSection(tab)
      window.location.hash = hashFor(tab, target)
    },

    toggleDrawer: (open) => set((state) => ({ drawer: open ?? !state.drawer })),
  }
})

/* Starts listening to the address bar. Returns the stop function. */
export function startNavigation() {
  const onChange = () => useNav.getState().sync(window.location.hash)
  window.addEventListener('hashchange', onChange)
  onChange()
  return () => window.removeEventListener('hashchange', onChange)
}
