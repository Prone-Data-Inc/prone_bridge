/* The courses the current buyer has unlocked. Reloaded when the buyer changes and when a live signal says one of their
   payments succeeded, so a purchase made in another window unlocks here too. */
import { create } from 'zustand'
import { listCourses } from '@/api/learners.js'
import { onSignal } from '@/realtime/bus.js'
import { useSession } from '@/stores/session.js'

export const useLearner = create((set, get) => ({
  courses: [],
  loaded: false,
  /* Why the last load failed, until one works. What is shown is kept, so a page can say so only when it has nothing. */
  error: null,

  async load() {
    const buyer = useSession.getState().buyer
    if (!buyer) return set({ courses: [], loaded: true, error: null })
    try {
      const { courses } = await listCourses(buyer.id)
      set({ courses, loaded: true, error: null })
    } catch (error) {
      /* keep what is shown, try again at the next signal */
      set({ error: error.message })
    }
  },

  owns: (productId) => get().courses.some((course) => course.id === productId),
}))

/* Loads now and keeps up with the buyer and with live signals. Returns the stop function. */
export function startLearner() {
  const reload = () => useLearner.getState().load()
  reload()
  const stopSession = useSession.subscribe((state, previous) => state.buyer?.id !== previous.buyer?.id && reload())
  const stopSignals = onSignal((signal) => {
    if (
      signal.table === 'payments' &&
      signal.status === 'succeeded' &&
      signal.buyerId === useSession.getState().buyer?.id
    )
      reload()
  })
  return () => {
    stopSession()
    stopSignals()
  }
}
