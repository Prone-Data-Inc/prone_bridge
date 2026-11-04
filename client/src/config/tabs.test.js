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

  it('gives the storefront its pages, with the ones reached by a link kept out of any menu', () => {
    const buyer = tabById('buyer')
    expect(buyer.sections.map((section) => section.id)).toEqual(['home', 'course', 'checkout', 'learn'])
    expect(buyer.sections.filter((section) => section.hidden).map((section) => section.id)).toEqual([
      'course',
      'checkout',
      'learn',
    ])
    for (const tab of TABS) {
      const shown = groupsOf(tab).flatMap((group) => group.sections)
      expect(shown.every((section) => !section.hidden)).toBe(true)
    }
  })
})
