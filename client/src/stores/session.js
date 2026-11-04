/* Who is who in the demo. The seller is always Prone Data Learning. The buyer is whoever last paid in this browser:
   their id and name are remembered here so their notifications and course access come back after a reload.
   There is no sign-in in this demo, the three roles are simulated. */
import { create } from 'zustand'

const KEY = 'pb.buyer'

function stored() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY))
    return value?.id ? value : null
  } catch {
    return null
  }
}

export const useSession = create((set) => ({
  merchant: 'pdl',
  buyer: stored(),

  setBuyer(buyer) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(buyer))
    } catch {
      /* private mode */
    }
    set({ buyer })
  },

  forgetBuyer() {
    try {
      window.localStorage.removeItem(KEY)
    } catch {
      /* private mode */
    }
    set({ buyer: null })
  },
}))
