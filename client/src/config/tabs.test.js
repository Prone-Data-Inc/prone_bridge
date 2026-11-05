import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB, TABS, groupsOf, sectionOf, tabById } from './tabs.js'

describe('tabs', () => {
  it('are the three fixed roles, in order', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['buyer', 'seller', 'admin'])
    expect(DEFAULT_TAB).toBe('buyer')
  })

  it('give every tab and page what the shell needs', () => {
    for (const tab of TABS) {
      expect(tab.label).toBeTruthy()
      expect(tab.icon).toBeTruthy()
      expect(['buyer', 'seller', 'admin']).toContain(tab.audience)
      expect(tab.identity.name).toBeTruthy()
      expect(tab.sections.length).toBeGreaterThan(0)
      for (const section of tab.sections) {
        expect(section.id).toMatch(/^[a-z]+$/)
        expect(section.label).toBeTruthy()
        expect(section.icon).toBeTruthy()
        expect(section.subtitle).toBeTruthy()
        expect(section.step).toBeGreaterThanOrEqual(4)
      }
      expect(new Set(tab.sections.map((section) => section.id)).size).toBe(tab.sections.length)
    }
  })

  it('has a sidebar for the seller and the admin, not for the storefront', () => {
    expect(tabById('buyer').sidebar).toBe(false)
    expect(tabById('seller').sidebar).toBe(true)
    expect(tabById('admin').sidebar).toBe(true)
  })

  it('finds a page', () => {
    expect(sectionOf('seller', 'payouts').label).toBe('Payouts')
    expect(sectionOf('seller', 'nope')).toBeUndefined()
    expect(sectionOf('nope', 'home')).toBeUndefined()
  })

  it('groups the sidebar in order, keeping every page', () => {
    const groups = groupsOf(tabById('seller'))
    expect(groups.map((group) => group.label)).toEqual(['Business', 'Reach', 'Assistant', 'Account'])
    expect(groups.flatMap((group) => group.sections)).toHaveLength(tabById('seller').sections.length)
    expect(groupsOf(tabById('admin')).map((group) => group.label)).toEqual(['Operations', 'Network', 'Trust'])
  })

  it('gives the seller the pages of the dashboard, with payment links among the business pages', () => {
    const seller = tabById('seller')
    expect(seller.sections.map((section) => section.id)).toEqual([
      'home',
      'payments',
      'customers',
      'payouts',
      'links',
      'countries',
      'copilot',
      'settings',
    ])
    expect(seller.sections.find((section) => section.id === 'home').label).toBe('Overview')
    expect(groupsOf(seller)[0].sections.map((section) => section.label)).toEqual([
      'Overview',
      'Payments',
      'Customers',
      'Payouts',
      'Payment links',
    ])
    /* the pages the seller dashboard builds have no step left to wait for */
    const built = seller.sections.filter((section) => section.step === 6).map((section) => section.id)
    expect(built).toEqual(['home', 'payments', 'customers', 'payouts', 'links', 'countries'])
  })

  it('gives the admin its eight pages, in the order of the sidebar', () => {
    const admin = tabById('admin')
    expect(admin.sections.map((section) => section.id)).toEqual([
      'overview',
      'transactions',
      'review',
      'merchants',
      'corridors',
      'settlements',
      'fairness',
      'audit',
    ])
    expect(groupsOf(admin).map((group) => group.sections.map((section) => section.label))).toEqual([
      ['Overview', 'Transactions', 'Risk review'],
      ['Merchants', 'Corridors', 'Settlements'],
      ['Fairness', 'Audit log'],
    ])
  })

  it('has a page for every section it lists, apart from Settings, which comes in step 9', async () => {
    const { PAGES } = await import('@/pages/index.js')
    const missing = TABS.flatMap((tab) => tab.sections.map((section) => `${tab.id}/${section.id}`)).filter(
      (key) => !(key in PAGES),
    )
    expect(missing).toEqual(['seller/settings'])
  })

  it('gives the storefront its pages, with the ones reached by a link kept out of any menu', () => {
    const buyer = tabById('buyer')
    expect(buyer.sections.map((section) => section.id)).toEqual(['home', 'course', 'checkout', 'learn', 'link'])
    expect(buyer.sections.filter((section) => section.hidden).map((section) => section.id)).toEqual([
      'course',
      'checkout',
      'learn',
      'link',
    ])
    for (const tab of TABS) {
      const shown = groupsOf(tab).flatMap((group) => group.sections)
      expect(shown.every((section) => !section.hidden)).toBe(true)
    }
  })
})
