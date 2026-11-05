/* The seller copilot's conversation. It lives here, not in the page, so moving to another page and back keeps it.
   A turn is { id, role, content, steps, actions, error }. Only plain text goes back to the server as history: the
   steps, the proposed changes and the errors stay on screen.
   A proposed change (an action) has a status: pending, confirmed, dismissed, failed or expired. */
import { create } from 'zustand'
import { askCopilot, confirmAction, dismissAction, getCopilotStatus } from '@/api/copilot.js'
import { toast } from '@/stores/toasts.js'

/* The server keeps the last twelve messages, so the page never sends more. */
const HISTORY = 12

let counter = 0
const turn = (fields) => ({ id: `turn-${++counter}`, steps: [], actions: [], error: null, ...fields })

const updateAction = (turns, id, change) =>
  turns.map((item) => ({
    ...item,
    actions: item.actions.map((action) => (action.id === id ? { ...action, ...change } : action)),
  }))

export const useCopilot = create((set, get) => ({
  /* { enabled, dailyTokenBudget, remainingTokens, pending } once loaded. */
  status: null,
  statusError: null,
  turns: [],
  asking: false,
  /* Proposed changes still waiting from an earlier visit, which are not part of this conversation. */
  waiting: [],

  async loadStatus() {
    try {
      const status = await getCopilotStatus()
      const known = new Set(get().turns.flatMap((item) => item.actions.map((action) => action.id)))
      set({ status, statusError: null, waiting: status.pending.filter((action) => !known.has(action.id)) })
    } catch (error) {
      set({ statusError: error.message })
    }
  },

  async ask(question) {
    const text = question.trim()
    if (!text || get().asking) return
    const history = get()
      .turns.filter((item) => !item.error)
      .slice(-(HISTORY - 1))
      .map((item) => ({ role: item.role, content: item.content }))
    set((state) => ({ turns: [...state.turns, turn({ role: 'user', content: text })], asking: true }))

    try {
      const answer = await askCopilot([...history, { role: 'user', content: text }])
      set((state) => ({
        turns: [
          ...state.turns,
          turn({ role: 'assistant', content: answer.reply, steps: answer.steps, actions: answer.actions }),
        ],
      }))
    } catch (error) {
      set((state) => ({
        turns: [...state.turns, turn({ role: 'assistant', content: '', error: error.message })],
      }))
    } finally {
      set({ asking: false })
      get().loadStatus()
    }
  },

  /* decision: 'confirm' or 'dismiss'. The button is shown busy until the server answers. */
  async decide(id, decision) {
    set((state) => ({
      turns: updateAction(state.turns, id, { busy: true }),
      waiting: state.waiting.map((action) => (action.id === id ? { ...action, busy: true } : action)),
    }))
    try {
      const { action } = await (decision === 'confirm' ? confirmAction : dismissAction)(id)
      set((state) => ({
        turns: updateAction(state.turns, id, { ...action, busy: false }),
        waiting: state.waiting.filter((item) => item.id !== id),
      }))
      if (decision === 'confirm') toast('Done. The change is made.', { tone: 'success' })
    } catch (error) {
      /* Too late, or already decided: the card says so, and the button goes. */
      const gone = error.status === 400 || error.status === 404 || error.status === 409
      set((state) => ({
        turns: updateAction(state.turns, id, {
          busy: false,
          status: gone ? 'expired' : 'pending',
          problem: error.message,
        }),
        waiting: gone
          ? state.waiting.filter((item) => item.id !== id)
          : state.waiting.map((item) => (item.id === id ? { ...item, busy: false } : item)),
      }))
      toast(error.message, { tone: 'danger' })
    }
    get().loadStatus()
  },

  reset() {
    set({ turns: [], asking: false })
    get().loadStatus()
  },
}))
