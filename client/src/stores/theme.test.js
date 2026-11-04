// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTheme, startTheme, useTheme } from './theme.js'

/* A stand-in for the system's color scheme that, like the real one, always reports the current answer. */
const systemIs = (initial) => {
  let dark = initial
  const listeners = new Set()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  }
  window.matchMedia = () => query
  return {
    change(next) {
      dark = next
      for (const listener of listeners) listener()
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  systemIs(false)
  useTheme.setState({ choice: 'system', theme: 'light' })
})
afterEach(() => vi.restoreAllMocks())

describe('resolveTheme', () => {
  it('follows the system only on "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('theme store', () => {
  it('steps through system, light, dark and back', () => {
    const seen = []
    for (let i = 0; i < 4; i++) {
      useTheme.getState().cycle()
      seen.push(useTheme.getState().choice)
    }
    expect(seen).toEqual(['light', 'dark', 'system', 'light'])
  })

  it('applies the theme to the page and remembers the choice', () => {
    useTheme.getState().set('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('pb.theme')).toBe('dark')
    expect(useTheme.getState().theme).toBe('dark')
  })

  it('still works when the browser will not store anything', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => useTheme.getState().set('dark')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('follows a change of the system while on "system", and not otherwise', () => {
    const system = systemIs(false)
    const stop = startTheme()
    expect(document.documentElement.dataset.theme).toBe('light')

    system.change(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    useTheme.getState().set('light')
    system.change(false)
    system.change(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })

  it('stops following the system when stopped', () => {
    const system = systemIs(false)
    const stop = startTheme()
    stop()
    system.change(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
