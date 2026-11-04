/* Whether PayPal is connected on the server. The checkout asks once; card and PayPal show as "Soon" until the answer is yes. */
import { create } from 'zustand'
import { getPaypalStatus } from '@/api/paypal.js'

export const usePaypal = create((set, get) => ({
  status: 'idle',
  available: false,

  async ensure() {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    try {
      const { available } = await getPaypalStatus()
      set({ status: 'ready', available: Boolean(available) })
    } catch {
      /* The server could not say: card and PayPal stay off, and the next checkout asks again. */
      set({ status: 'idle', available: false })
    }
  },
}))
