// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toasts from '@/ui/Toasts.jsx'
import { toast, useToasts } from './toasts.js'

beforeEach(() => {
  vi.useFakeTimers()
  useToasts.setState({ items: [] })
})
afterEach(() => vi.useRealTimers())

describe('toast store', () => {
  it('adds a message and removes it after a few seconds', () => {
    toast('Saved')
    expect(useToasts.getState().items).toHaveLength(1)
    act(() => vi.advanceTimersByTime(5001))
    expect(useToasts.getState().items).toHaveLength(0)
  })

  it('keeps a message that has no duration until it is dismissed', () => {
    const id = useToasts.getState().push({ message: 'Stay', duration: 0 })
    act(() => vi.advanceTimersByTime(60_000))
    expect(useToasts.getState().items).toHaveLength(1)
    useToasts.getState().dismiss(id)
    expect(useToasts.getState().items).toHaveLength(0)
  })

  it('shows at most three at once, newest kept', () => {
    for (const text of ['one', 'two', 'three', 'four']) toast(text)
    expect(useToasts.getState().items.map((item) => item.message)).toEqual(['two', 'three', 'four'])
  })

  it('defaults to a neutral tone', () => {
    toast('Hi')
    expect(useToasts.getState().items[0].tone).toBe('neutral')
  })
})

describe('Toasts', () => {
  it('shows the role, title and message of a toast', () => {
    toast('Kofi bought SQL.', { eyebrow: 'Seller', title: 'New sale', tone: 'success' })
    render(<Toasts />)
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.textContent).toContain('Seller')
    expect(region.textContent).toContain('New sale')
    expect(region.textContent).toContain('Kofi bought SQL.')
  })

  it('runs the action of a clickable toast and then dismisses it', () => {
    const onClick = vi.fn()
    toast('Open it', { title: 'Seller', onClick })
    render(<Toasts />)
    fireEvent.click(screen.getByRole('button', { name: /Open it/ }))
    expect(onClick).toHaveBeenCalled()
    expect(useToasts.getState().items).toHaveLength(0)
  })

  it('can be dismissed by hand', () => {
    toast('Bye')
    render(<Toasts />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(useToasts.getState().items).toHaveLength(0)
  })
})
