// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emitSignal } from '@/realtime/bus.js'
import { useRealtime } from '@/stores/realtime.js'
import { useSellerData } from './useSellerData.js'

const answer = (value, merchantId = 'm-1') => ({ merchant: { id: merchantId }, value })

beforeEach(() => useRealtime.setState({ status: 'live' }))
afterEach(() => vi.useRealTimers())

describe('useSellerData', () => {
  it('loads on mount, and says so while it does', async () => {
    const load = vi.fn(async () => answer(1))
    const { result } = renderHook(() => useSellerData(load, 'a'))
    expect(result.current).toMatchObject({ status: 'loading', data: null })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.data.value).toBe(1)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads again when the key changes, keeping the old numbers on screen until the new ones arrive', async () => {
    let release
    const load = vi.fn(async () => answer('first'))
    const { result, rerender } = renderHook(({ key }) => useSellerData(load, key), { initialProps: { key: 'a' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    load.mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    rerender({ key: 'b' })
    await waitFor(() => expect(result.current.status).toBe('refreshing'))
    expect(result.current.data.value).toBe('first')

    await act(async () => release(answer('second')))
    expect(result.current).toMatchObject({ status: 'ready', data: { value: 'second' } })
  })

  it('uses the latest loader, so it asks for what the page asks for now', async () => {
    const seen = []
    const { rerender } = renderHook(
      ({ days }) =>
        useSellerData(async () => {
          seen.push(days)
          return answer(days)
        }, String(days)),
      { initialProps: { days: 30 } },
    )
    await waitFor(() => expect(seen).toEqual([30]))
    rerender({ days: 7 })
    await waitFor(() => expect(seen).toEqual([30, 7]))
  })

  it('never lets a slow old answer replace a newer one', async () => {
    const resolvers = []
    const load = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)))
    const { result, rerender } = renderHook(({ key }) => useSellerData(load, key), { initialProps: { key: 'a' } })
    await waitFor(() => expect(resolvers).toHaveLength(1))
    rerender({ key: 'b' })
    await waitFor(() => expect(resolvers).toHaveLength(2))

    await act(async () => resolvers[1](answer('new')))
    await act(async () => resolvers[0](answer('old')))
    expect(result.current.data.value).toBe('new')
  })

  it('says what went wrong when there is nothing to show', async () => {
    const { result } = renderHook(() =>
      useSellerData(async () => Promise.reject(new Error('We could not reach the server.')), 'a'),
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current).toMatchObject({ data: null, error: 'We could not reach the server.' })
  })

  it('keeps the old numbers when a reload fails, and can try again', async () => {
    const load = vi.fn(async () => answer('kept'))
    const { result } = renderHook(() => useSellerData(load, 'a'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    load.mockRejectedValueOnce(new Error('offline'))
    await act(async () => result.current.reload())
    expect(result.current).toMatchObject({ status: 'error', error: 'offline', data: { value: 'kept' } })

    await act(async () => result.current.reload())
    expect(result.current).toMatchObject({ status: 'ready', error: null })
  })

  it('ignores a cancelled request', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const load = vi.fn(async () => answer('ok'))
    const { result } = renderHook(() => useSellerData(load, 'a'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    load.mockRejectedValueOnce(abort)
    await act(async () => result.current.reload({ quiet: true }))
    expect(result.current.status).toBe('ready')
  })

  it('reloads quietly, without showing that it is working', async () => {
    const load = vi.fn(async () => answer('x'))
    const { result } = renderHook(() => useSellerData(load, 'a'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => result.current.reload({ quiet: true }))
    expect(result.current.status).toBe('ready')
    expect(load).toHaveBeenCalledTimes(2)
  })

  describe('live changes', () => {
    const settle = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms))

    it("reloads when one of the seller's payments changes, once for a burst of signals", async () => {
      vi.useFakeTimers()
      const load = vi.fn(async () => answer('x'))
      renderHook(() => useSellerData(load, 'a'))
      await settle(0)
      expect(load).toHaveBeenCalledTimes(1)

      emitSignal({ table: 'payments', merchantId: 'm-1', status: 'succeeded' })
      emitSignal({ table: 'payments', merchantId: 'm-1', status: 'succeeded' })
      emitSignal({ table: 'payouts', merchantId: 'm-1' })
      await settle(100)
      expect(load).toHaveBeenCalledTimes(1)
      await settle(800)
      expect(load).toHaveBeenCalledTimes(2)
    })

    it('ignores another seller, a table it was not asked to watch, and a signal for nothing', async () => {
      vi.useFakeTimers()
      const load = vi.fn(async () => answer('x'))
      renderHook(() => useSellerData(load, 'a'))
      await settle(0)

      emitSignal({ table: 'payments', merchantId: 'someone-else' })
      emitSignal({ table: 'notifications', merchantId: 'm-1' })
      await settle(2000)
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('watches only what it is told to', async () => {
      vi.useFakeTimers()
      const load = vi.fn(async () => answer('x'))
      const watch = ['payouts']
      renderHook(() => useSellerData(load, 'a', { watch }))
      await settle(0)
      emitSignal({ table: 'payments', merchantId: 'm-1' })
      await settle(2000)
      expect(load).toHaveBeenCalledTimes(1)
      emitSignal({ table: 'payouts', merchantId: 'm-1' })
      await settle(2000)
      expect(load).toHaveBeenCalledTimes(2)
    })

    it('stops listening when the page goes away', async () => {
      vi.useFakeTimers()
      const load = vi.fn(async () => answer('x'))
      const { unmount } = renderHook(() => useSellerData(load, 'a'))
      await settle(0)
      unmount()
      emitSignal({ table: 'payments', merchantId: 'm-1' })
      await settle(2000)
      expect(load).toHaveBeenCalledTimes(1)
    })

    it('checks every thirty seconds when the live connection is down, and not when it is up', async () => {
      vi.useFakeTimers()
      const load = vi.fn(async () => answer('x'))
      renderHook(() => useSellerData(load, 'a'))
      await settle(0)
      await settle(95_000)
      expect(load).toHaveBeenCalledTimes(1)

      act(() => useRealtime.setState({ status: 'closed' }))
      await settle(95_000)
      expect(load.mock.calls.length).toBeGreaterThanOrEqual(4)
    })
  })
})
