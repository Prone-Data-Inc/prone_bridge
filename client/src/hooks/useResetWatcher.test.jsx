// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/reload.js', () => ({ reloadApp: vi.fn() }))

const { reloadApp } = await import('@/lib/reload.js')
const { emitSignal } = await import('@/realtime/bus.js')
const { useSession } = await import('@/stores/session.js')
const { useToasts } = await import('@/stores/toasts.js')
const { RELOAD_DELAY_MS, useResetWatcher } = await import('./useResetWatcher.js')

function Watcher() {
  useResetWatcher()
  return null
}

beforeEach(() => {
  vi.useFakeTimers()
  reloadApp.mockReset()
  window.localStorage.clear()
  useToasts.setState({ items: [] })
  useSession.setState({ buyer: { id: 'b-1', name: 'Aminata', email: 'a@example.com' } })
})
afterEach(() => vi.useRealTimers())

describe('useResetWatcher', () => {
  it('says the demo was reset, forgets the buyer, and loads the app again a moment later', () => {
    render(<Watcher />)
    act(() => emitSignal({ table: 'demo', op: 'RESET' }))
    expect(useToasts.getState().items.map((item) => item.message)).toEqual([
      'The demo was reset. Loading the fresh data.',
    ])
    expect(useSession.getState().buyer).toBeNull()
    expect(reloadApp).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('loads once, even if the signal comes twice', () => {
    render(<Watcher />)
    act(() => {
      emitSignal({ table: 'demo', op: 'RESET' })
      emitSignal({ table: 'demo', op: 'RESET' })
    })
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS * 2))
    expect(reloadApp).toHaveBeenCalledTimes(1)
    expect(useToasts.getState().items).toHaveLength(1)
  })

  it('ignores every other signal', () => {
    render(<Watcher />)
    act(() => {
      emitSignal({ table: 'payments', op: 'UPDATE', id: 'p1' })
      emitSignal({ table: 'demo', op: 'SOMETHING' })
      emitSignal({ table: 'notifications', op: 'INSERT' })
    })
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS * 2))
    expect(reloadApp).not.toHaveBeenCalled()
    expect(useSession.getState().buyer).not.toBeNull()
  })

  it('stops listening, and cancels the load, when the app goes away', () => {
    const { unmount } = render(<Watcher />)
    act(() => emitSignal({ table: 'demo', op: 'RESET' }))
    unmount()
    act(() => vi.advanceTimersByTime(RELOAD_DELAY_MS * 2))
    expect(reloadApp).not.toHaveBeenCalled()
    act(() => emitSignal({ table: 'demo', op: 'RESET' }))
    expect(useToasts.getState().items).toHaveLength(1)
  })
})
