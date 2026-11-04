/* Test setup for browser-like tests: jsdom lacks a few browser features the app uses. Server tests (Node) skip this. */
import { afterEach } from 'vitest'

if (typeof window !== 'undefined') {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })

  /* Reports a fixed width at once, so charts draw. */
  window.ResizeObserver ??= class {
    constructor(callback) {
      this.callback = callback
    }
    observe(target) {
      this.callback([{ target, contentRect: { width: 480, height: 240 } }])
    }
    unobserve() {}
    disconnect() {}
  }

  Element.prototype.scrollTo ??= function scrollTo() {}

  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)
}
