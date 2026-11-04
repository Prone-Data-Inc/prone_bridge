// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/notifications.js', () => ({
  listNotifications: vi.fn(async () => ({ items: [] })),
  getNotificationSummary: vi.fn(async () => ({ buyer: 0, seller: 0, admin: 0 })),
  markNotificationsRead: vi.fn(async () => ({ marked: 0 })),
}))

const { useNav } = await import('@/stores/nav.js')
const { useSession } = await import('@/stores/session.js')
const { useTheme } = await import('@/stores/theme.js')
const { default: AppShell } = await import('./AppShell.jsx')

const open = (tab, section) => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab, section, drawer: false })
}

beforeEach(() => {
  useSession.setState({ merchant: 'pdl', buyer: null })
})

describe('AppShell', () => {
  it('draws the tab strip, the toolbar and the page of the open tab', () => {
    open('seller', 'payments')
    render(<AppShell />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs.textContent).toBe('SellerPayments')
    expect(screen.getByRole('heading', { level: 1, name: 'Payments' })).toBeTruthy()
    expect(screen.getByText('This page is built in step 6.')).toBeTruthy()
    expect(screen.getByRole('tabpanel').id).toBe('workspace')
  })

  it('gives the seller its sidebar, grouped, with the open page marked', () => {
    open('seller', 'payments')
    render(<AppShell />)

    const nav = screen.getByRole('complementary', { name: 'Seller navigation' })
    for (const label of ['Home', 'Payments', 'Customers', 'Payouts', 'Countries', 'Copilot', 'Settings']) {
      expect(within(nav).getByRole('button', { name: label })).toBeTruthy()
    }
    expect(within(nav).getByText('Business')).toBeTruthy()
    expect(within(nav).getByRole('button', { name: 'Payments' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull()
  })

  it('gives the admin its own sidebar', () => {
    open('admin', 'overview')
    render(<AppShell />)
    const nav = screen.getByRole('complementary', { name: 'Admin navigation' })
    for (const label of [
      'Overview',
      'Transactions',
      'Risk review',
      'Merchants',
      'Corridors',
      'Settlements',
      'Fairness',
      'Audit log',
    ]) {
      expect(within(nav).getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('has no sidebar on the storefront', () => {
    open('buyer', 'home')
    render(<AppShell />)
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('opens another page from the sidebar', () => {
    open('seller', 'home')
    render(<AppShell />)
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Seller navigation' })).getByRole('button', { name: 'Payouts' }),
    )
    expect(window.location.hash).toBe('#/seller/payouts')
  })

  it('opens and closes the sidebar drawer from the toolbar', () => {
    open('seller', 'home')
    render(<AppShell />)
    const aside = screen.getByRole('complementary', { name: 'Seller navigation' })
    expect(aside.getAttribute('data-open')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('complementary', { name: 'Seller navigation' }).getAttribute('data-open')).toBe('true')
  })

  it('names who is signed in for each role, and the buyer once they have paid', () => {
    open('seller', 'home')
    const { unmount } = render(<AppShell />)
    expect(screen.getByText('Prone Data Learning')).toBeTruthy()
    unmount()

    open('buyer', 'home')
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Diallo' } })
    render(<AppShell />)
    expect(screen.getByText('Aminata Diallo')).toBeTruthy()
  })

  it('switches the theme from the toolbar', () => {
    open('seller', 'home')
    useTheme.getState().set('light')
    render(<AppShell />)
    fireEvent.click(screen.getByRole('button', { name: /Theme: Light/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: /Theme: Dark/ })).toBeTruthy()
  })
})
