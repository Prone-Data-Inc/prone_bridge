// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { hashFor, parseHash, startNavigation, useNav } from './nav.js'

describe('parseHash', () => {
  it('opens the buyer tab when there is nothing', () => {
    expect(parseHash('')).toEqual({ view: 'app', tab: 'buyer', section: 'home', param: null })
    expect(parseHash('#')).toEqual({ view: 'app', tab: 'buyer', section: 'home', param: null })
  })

  it('reads a tab and a page', () => {
    expect(parseHash('#/seller/payments')).toEqual({ view: 'app', tab: 'seller', section: 'payments', param: null })
    expect(parseHash('#/admin/review')).toEqual({ view: 'app', tab: 'admin', section: 'review', param: null })
  })

  it('reads the name after a page', () => {
    expect(parseHash('#/buyer/course/ai-for-work')).toEqual({
      view: 'app',
      tab: 'buyer',
      section: 'course',
      param: 'ai-for-work',
    })
    expect(parseHash('#/buyer/checkout/prompt-craft').param).toBe('prompt-craft')
  })

  it('decodes the name, and drops one it cannot read', () => {
    expect(parseHash('#/buyer/course/a%20b').param).toBe('a b')
    expect(parseHash('#/buyer/course/%E0%A4%A').param).toBeNull()
  })

  it('falls back to the first page of a tab for an unknown page, and forgets the name', () => {
    expect(parseHash('#/seller/nothing')).toEqual({ view: 'app', tab: 'seller', section: 'home', param: null })
    expect(parseHash('#/seller/nothing/extra')).toEqual({ view: 'app', tab: 'seller', section: 'home', param: null })
    expect(parseHash('#/admin')).toEqual({ view: 'app', tab: 'admin', section: 'overview', param: null })
  })

  it('falls back to the buyer tab for an unknown tab', () => {
    expect(parseHash('#/nowhere/payments')).toEqual({ view: 'app', tab: 'buyer', section: 'home', param: null })
  })

  it('opens the design system gallery', () => {
    expect(parseHash('#/ui')).toEqual({ view: 'ui', tab: null, section: null, param: null })
  })

  it('round trips with hashFor', () => {
    expect(parseHash(hashFor('admin', 'corridors'))).toMatchObject({ tab: 'admin', section: 'corridors', param: null })
    expect(parseHash(hashFor('buyer', 'course', 'a b/c'))).toMatchObject({ section: 'course', param: 'a b/c' })
  })
})

describe('hashFor', () => {
  it('adds the name only when there is one', () => {
    expect(hashFor('seller', 'payments')).toBe('#/seller/payments')
    expect(hashFor('buyer', 'course', 'ai-for-work')).toBe('#/buyer/course/ai-for-work')
    expect(hashFor('buyer', 'course', null)).toBe('#/buyer/course')
  })

  it('encodes what would break the address', () => {
    expect(hashFor('buyer', 'course', 'a b/c')).toBe('#/buyer/course/a%20b%2Fc')
  })
})

describe('navigation store', () => {
  let stop

  beforeEach(() => {
    /* each test starts as a fresh visit: every tab on its first page, nothing opened yet */
    useNav.setState({
      sections: { buyer: 'home', seller: 'home', admin: 'overview' },
      params: { buyer: null, seller: null, admin: null },
      visited: {},
      drawer: false,
    })
    window.location.hash = ''
    stop = startNavigation()
  })
  afterEach(() => stop())

  const at = (tab, section, param = null) =>
    vi.waitFor(() => expect(useNav.getState()).toMatchObject({ tab, section, param }))

  it('starts on the buyer tab', () => {
    expect(useNav.getState()).toMatchObject({ view: 'app', tab: 'buyer', section: 'home' })
  })

  it('opens a page through the address bar', async () => {
    useNav.getState().go('seller', 'payments')
    await at('seller', 'payments')
    expect(window.location.hash).toBe('#/seller/payments')
  })

  it('opens a page with a name', async () => {
    useNav.getState().go('buyer', 'course', 'ai-for-work')
    await at('buyer', 'course', 'ai-for-work')
    expect(window.location.hash).toBe('#/buyer/course/ai-for-work')
    expect(useNav.getState().params.buyer).toBe('ai-for-work')
  })

  it('follows the browser when the address changes by hand or with back and forward', async () => {
    window.location.hash = '#/admin/audit'
    await at('admin', 'audit')
  })

  it('gives each tab back the page it was on', async () => {
    useNav.getState().go('seller', 'payouts')
    await at('seller', 'payouts')
    useNav.getState().go('admin')
    await at('admin', 'overview')
    useNav.getState().go('seller')
    await at('seller', 'payouts')
  })

  it('gives a tab back the name of its page as well', async () => {
    useNav.getState().go('buyer', 'checkout', 'prompt-craft')
    await at('buyer', 'checkout', 'prompt-craft')
    useNav.getState().go('seller', 'home')
    await at('seller', 'home')
    useNav.getState().go('buyer')
    await at('buyer', 'checkout', 'prompt-craft')
  })

  it('does not carry a name over to another page', async () => {
    useNav.getState().go('buyer', 'course', 'ai-for-work')
    await at('buyer', 'course', 'ai-for-work')
    useNav.getState().go('buyer', 'home')
    await at('buyer', 'home', null)
    expect(useNav.getState().params.buyer).toBeNull()
  })

  it('remembers which tabs have been opened, so they can stay alive', async () => {
    expect(useNav.getState().visited).toEqual({ buyer: true })
    useNav.getState().go('seller', 'home')
    await at('seller', 'home')
    useNav.getState().go('admin')
    await at('admin', 'overview')
    expect(useNav.getState().visited).toEqual({ buyer: true, seller: true, admin: true })
  })

  it('closes the drawer when the page changes', async () => {
    useNav.getState().go('seller', 'home')
    await at('seller', 'home')
    useNav.getState().toggleDrawer(true)
    expect(useNav.getState().drawer).toBe(true)
    useNav.getState().go('seller', 'customers')
    await at('seller', 'customers')
    expect(useNav.getState().drawer).toBe(false)
  })
})
