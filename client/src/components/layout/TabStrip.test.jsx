// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/notifications.js', () => ({
  listNotifications: vi.fn(async () => ({ items: [] })),
  getNotificationSummary: vi.fn(async () => ({ buyer: 0, seller: 0, admin: 0 })),
  markNotificationsRead: vi.fn(async () => ({ marked: 0 })),
}))

const { useNav } = await import('@/stores/nav.js')
const { useNotifications } = await import('@/stores/notifications.js')
const { useRealtime } = await import('@/stores/realtime.js')
const { default: TabStrip } = await import('./TabStrip.jsx')

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'seller', section: 'home' })
  useNotifications.setState({ unread: { buyer: 0, seller: 0, admin: 0 } })
  useRealtime.setState({ status: 'live' })
})

describe('TabStrip', () => {
  it('shows the three roles as tabs, with the open one selected', () => {
    render(<TabStrip />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Buyer', 'Seller', 'Admin'])
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('points each tab at its own pane', () => {
    render(<TabStrip />)
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-controls'))).toEqual([
      'workspace-buyer',
      'workspace-seller',
      'workspace-admin',
    ])
  })

  it('cannot close, add or move tabs', () => {
    render(<TabStrip />)
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /new|add|\+/i })).toBeNull()
    for (const tab of screen.getAllByRole('tab')) expect(tab.getAttribute('draggable')).not.toBe('true')
  })

  it('opens a tab when it is clicked', () => {
    render(<TabStrip />)
    fireEvent.click(screen.getByRole('tab', { name: 'Admin' }))
    expect(window.location.hash).toBe('#/admin/overview')
  })

  it('moves between tabs with the arrow keys, wrapping around', () => {
    render(<TabStrip />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Seller' }), { key: 'ArrowRight' })
    expect(window.location.hash).toBe('#/admin/overview')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Seller' }), { key: 'ArrowLeft' })
    expect(window.location.hash).toBe('#/buyer/home')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Seller' }), { key: 'End' })
    expect(window.location.hash).toBe('#/admin/overview')
  })

  it('only the open tab can be reached with Tab, the others with arrows', () => {
    render(<TabStrip />)
    expect(screen.getByRole('tab', { name: 'Seller' }).tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'Buyer' }).tabIndex).toBe(-1)
  })

  it('shows what is new on the tabs you are not on', () => {
    useNotifications.setState({ unread: { buyer: 0, seller: 3, admin: 12 } })
    render(<TabStrip />)
    const admin = screen.getByRole('tab', { name: /Admin/ })
    expect(within(admin).getByLabelText('12 new').textContent).toBe('9+')
    expect(within(screen.getByRole('tab', { name: 'Seller' })).queryByLabelText(/new/)).toBeNull()
    expect(within(screen.getByRole('tab', { name: 'Buyer' })).queryByLabelText(/new/)).toBeNull()
  })

  it('says whether live updates are on', () => {
    render(<TabStrip />)
    expect(screen.getByRole('status').textContent).toBe('Live')
  })

  it('says it falls back to refreshing when live updates are not available', () => {
    useRealtime.setState({ status: 'off' })
    render(<TabStrip />)
    expect(screen.getByRole('status').textContent).toBe('Refreshing')
  })

  it('has no tab selected on the design system page, and the first one reachable', () => {
    useNav.setState({ view: 'ui', tab: null, section: null })
    render(<TabStrip />)
    expect(screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true)
    expect(screen.getByRole('tab', { name: 'Buyer' }).tabIndex).toBe(0)
  })
})

describe('Demo notice', () => {
  it('opens an honest list of what is real and what is simulated, and closes', () => {
    render(<TabStrip />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    const dialog = screen.getByRole('dialog', { name: 'About this demo' })
    expect(within(dialog).getByText('Real')).toBeTruthy()
    expect(within(dialog).getByText('Simulated')).toBeTruthy()
    expect(dialog.textContent).toMatch(/sandbox/i)
    expect(dialog.textContent).toMatch(/No bank, wallet or payment company/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
