/* Notifications for the three tabs, kept in one place. Each audience (buyer, seller, admin) has its list and its unread
   count; the tab strip shows the counts, the bell shows the list of the open tab. A live signal refreshes the right
   audience and announces new notifications with a toast, wherever the person is. */
import { create } from 'zustand'
import { getNotificationSummary, listNotifications, markNotificationsRead } from '@/api/notifications.js'
import { onSignal } from '@/realtime/bus.js'
import { useNav } from '@/stores/nav.js'
import { useSession } from '@/stores/session.js'
import { toast } from '@/stores/toasts.js'
import { TABS } from '@/config/tabs.js'

const AUDIENCES = ['buyer', 'seller', 'admin']
const empty = () => Object.fromEntries(AUDIENCES.map((audience) => [audience, []]))
const zero = () => Object.fromEntries(AUDIENCES.map((audience) => [audience, 0]))
const ROLE = { buyer: 'Buyer', seller: 'Seller', admin: 'Admin' }
const TONE = { info: 'neutral', success: 'success', warning: 'warning', danger: 'danger' }

const scope = () => {
  const { merchant, buyer } = useSession.getState()
  return { merchant, buyer: buyer?.id }
}

export const useNotifications = create((set, get) => ({
  items: empty(),
  unread: zero(),
  loaded: Object.fromEntries(AUDIENCES.map((audience) => [audience, false])),
  error: null,

  async loadSummary() {
    try {
      const unread = await getNotificationSummary(scope())
      set({ unread, error: null })
    } catch (error) {
      set({ error: error.message })
    }
  },

  /* Fetches one audience's list. With announce, notifications that were not known before get a toast. */
  async load(audience, { announce = false } = {}) {
    try {
      const { items } = await listNotifications({ audience, limit: 20, ...scope() })
      const known = new Set(get().items[audience].map((item) => item.id))
      const wasLoaded = get().loaded[audience]
      set((state) => ({
        items: { ...state.items, [audience]: items },
        loaded: { ...state.loaded, [audience]: true },
        error: null,
      }))
      if (announce && wasLoaded) {
        for (const item of items.filter((entry) => !known.has(entry.id) && !entry.readAt).reverse())
          announceNotification(audience, item)
      }
    } catch (error) {
      set({ error: error.message })
    }
  },

  async refresh(audience, options) {
    await Promise.all([get().load(audience, options), get().loadSummary()])
  },

  /* Marks notifications read right away on screen, then on the server. ids omitted marks the whole audience. */
  async markRead(audience, ids) {
    const mark = (item) =>
      !item.readAt && (!ids || ids.includes(item.id)) ? { ...item, readAt: new Date().toISOString() } : item
    const before = get()
    const cleared = before.items[audience].filter((item) => !item.readAt && (!ids || ids.includes(item.id))).length
    set((state) => ({
      items: { ...state.items, [audience]: state.items[audience].map(mark) },
      unread: { ...state.unread, [audience]: Math.max(0, state.unread[audience] - cleared) },
    }))
    try {
      await markNotificationsRead({ audience, ids, ...scope() })
    } catch (error) {
      set({ items: before.items, unread: before.unread, error: error.message })
    }
  },

  /* A live signal. Only notification signals matter here. */
  async handleSignal(signal) {
    if (signal.table !== 'notifications') return
    const { buyer } = useSession.getState()
    if (signal.audience === 'buyer' && signal.buyerId !== buyer?.id) return
    await get().refresh(signal.audience, { announce: true })
  },
}))

function announceNotification(audience, item) {
  const tab = TABS.find((entry) => entry.audience === audience)
  toast(item.body, {
    eyebrow: ROLE[audience],
    title: item.title,
    tone: TONE[item.level] ?? 'neutral',
    onClick: tab && audience !== useNav.getState().tab ? () => useNav.getState().go(tab.id) : undefined,
  })
}

/* Loads the counts and the open tab's list, then listens for live signals. Returns the stop function. */
export function startNotifications() {
  const { load, loadSummary, handleSignal } = useNotifications.getState()
  loadSummary()
  /* Every audience is loaded once, so a live signal for a tab you are not on can still be announced. */
  for (const { audience } of TABS) load(audience)
  return onSignal(handleSignal)
}
