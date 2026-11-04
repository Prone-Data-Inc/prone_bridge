/* Short messages that appear for a few seconds. toast('Saved'), toast('Payment received', { tone: 'success', title: 'Seller' }). */
import { create } from 'zustand'

const MAX_VISIBLE = 3
let counter = 0

export const useToasts = create((set, get) => ({
  items: [],

  push(toast) {
    const id = ++counter
    const item = { id, tone: 'neutral', duration: 5000, ...toast }
    set((state) => ({ items: [...state.items, item].slice(-MAX_VISIBLE) }))
    if (item.duration) setTimeout(() => get().dismiss(id), item.duration)
    return id
  },

  dismiss(id) {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
}))

/* tone: neutral, success, warning, danger. onClick makes the whole toast a button. */
export const toast = (message, options = {}) => useToasts.getState().push({ message, ...options })
