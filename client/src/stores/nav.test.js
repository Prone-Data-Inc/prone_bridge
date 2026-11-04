// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { hashFor, parseHash, startNavigation, useNav } from './nav.js'

describe('parseHash', () => {
  it('opens the buyer tab when there is nothing', () => {
    expect(parseHash('')).toEqual({ view: 'app', tab: 'buyer', section: 'home' })
    expect(parseHash('#')).toEqual({ view: 'app', tab: 'buyer', section: 'home' })
  })

  it('reads a tab and a page', () => {
    expect(parseHash('#/seller/payments')).toEqual({ view: 'app', tab: 'seller', section: 'payments' })
    expect(parseHash('#/admin/review')).toEqual({ view: 'app', tab: 'admin', section: 'review' })
  })

  it('falls back to the first page of a tab for an unknown page', () => {
    expect(parseHash('#/seller/nothing')).toEqual({ view: 'app', tab: 'seller', section: 'home' })
    expect(parseHash('#/admin')).toEqual({ view: 'app', tab: 'admin', section: 'overview' })
  })

  it('falls back to the buyer tab for an unknown tab', () => {
    expect(parseHash('#/nowhere/payments')).toEqual({ view: 'app', tab: 'buyer', section: 'home' })
  })

  it('opens the design system gallery', () => {
    expect(parseHash('#/ui')).toEqual({ view: 'ui', tab: null, section: null })
  })

  it('round trips with hashFor', () => {
    expect(parseHash(hashFor('admin', 'corridors'))).toMatchObject({ tab: 'admin', section: 'corridors' })
  })
})

describe('navigation store', () => {
  let stop

  beforeEach(() => {
    /* each test starts as a fresh visit: every tab on its first page */
    useNav.setState({ sections: { buyer: 'home', seller: 'home', admin: 'overview' }, drawer: false })
    window.location.hash = ''
    stop = startNavigation()
  })
  afterEach(() => stop())

  const at = (tab, section) => vi.waitFor(() => expect(useNav.getState()).toMatchObject({ tab, section }))

  it('starts on the buyer tab', () => {
    expect(useNav.getState()).toMatchObject({ view: 'app', tab: 'buyer', section: 'home' })
  })

  it('opens a page through the address bar', async () => {
    useNav.getState().go('seller', 'payments')
    await at('seller', 'payments')
    expect(window.location.hash).toBe('#/seller/payments')
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
