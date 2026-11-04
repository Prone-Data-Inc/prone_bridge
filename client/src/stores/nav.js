/* Which tab and which page are open. The address bar is the source of truth (#/seller/payments, or #/buyer/course/ai-for-work
   with a name after the page), so the browser's back and forward buttons work and a link opens exactly where it was
   copied. Each tab remembers its own page, like browser tabs do, and a tab you have opened stays alive in the background
   so nothing you were doing in it is lost. #/ui opens the design system gallery. */
import { create } from 'zustand'
import { DEFAULT_TAB, TABS, sectionOf, tabById } from '@/config/tabs.js'

const firstSection = (tabId) => tabById(tabId).sections[0].id

const initialSections = () => Object.fromEntries(TABS.map((tab) => [tab.id, firstSection(tab.id)]))
const noParams = () => Object.fromEntries(TABS.map((tab) => [tab.id, null]))

const decode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/* '#/buyer/course/ai-for-work' -> { view: 'app', tab: 'buyer', section: 'course', param: 'ai-for-work' }.
   Unknown paths fall back to a valid page. */
export function parseHash(hash = '') {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'ui') return { view: 'ui', tab: null, section: null, param: null }
  const tab = tabById(parts[0]) ? parts[0] : DEFAULT_TAB
  const known = sectionOf(tab, parts[1])
  const section = known ? parts[1] : firstSection(tab)
  const param = known && parts[2] ? decode(parts[2]) : null
  return { view: 'app', tab, section, param }
}

export const hashFor = (tab, section, param) => `#/${tab}/${section}${param ? `/${encodeURIComponent(param)}` : ''}`

const read = () => (typeof window === 'undefined' ? parseHash('') : parseHash(window.location.hash))

export const useNav = create((set, get) => {
  const start = read()
  return {
    ...start,
    sections: { ...initialSections(), ...(start.tab ? { [start.tab]: start.section } : {}) },
    params: { ...noParams(), ...(start.tab ? { [start.tab]: start.param } : {}) },
    /* Tabs that have been opened. Their pages stay mounted, hidden, while you are on another tab. */
    visited: start.tab ? { [start.tab]: true } : {},
    drawer: false,

    /* Called when the address changes. */
    sync(hash) {
      const next = parseHash(hash)
      set((state) => ({
        ...next,
        sections: next.tab ? { ...state.sections, [next.tab]: next.section } : state.sections,
        params: next.tab ? { ...state.params, [next.tab]: next.param } : state.params,
        visited: next.tab ? { ...state.visited, [next.tab]: true } : state.visited,
        drawer: false,
      }))
    },

    /* Open a tab, at the page it was last on, or a page of a tab (with a name after it, if the page takes one). The address
       bar changes, then sync runs. */
    go(tab, section, param) {
      const { sections, params } = get()
      const target = section ?? sections[tab] ?? firstSection(tab)
      const name = section ? param : params[tab]
      window.location.hash = hashFor(tab, target, name)
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
