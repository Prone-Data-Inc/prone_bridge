// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/notifications.js', () => ({
  listNotifications: vi.fn(),
  getNotificationSummary: vi.fn(async () => ({ buyer: 0, seller: 0, admin: 0 })),
  markNotificationsRead: vi.fn(async () => ({ marked: 1 })),
}))

const api = await import('@/api/notifications.js')
const { useNav } = await import('@/stores/nav.js')
const { useNotifications } = await import('@/stores/notifications.js')
const { default: NotificationBell } = await import('./NotificationBell.jsx')

const item = (id, over = {}) => ({
  id,
  audience: 'seller',
  kind: 'test',
  level: 'info',
  title: `Title ${id}`,
  body: `Body ${id}`,
  paymentId: null,
  readAt: null,
  createdAt: new Date().toISOString(),
  ...over,
})

const setup = (tab, { items = [], unread = 0, loaded = true, error = null } = {}) => {
  const audience = { buyer: 'buyer', seller: 'seller', admin: 'admin' }[tab]
  useNav.setState({ view: 'app', tab, section: 'home' })
  useNotifications.setState({
    items: { buyer: [], seller: [], admin: [], [audience]: items },
    unread: { buyer: 0, seller: 0, admin: 0, [audience]: unread },
    loaded: { buyer: loaded, seller: loaded, admin: loaded },
    error,
  })
  api.listNotifications.mockImplementation(async () => ({ items }))
}

describe('NotificationBell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows how many are new on the bell', () => {
    setup('seller', { items: [item('a'), item('b')], unread: 2 })
    render(<NotificationBell />)
    expect(screen.getByRole('button', { name: 'Notifications, 2 new' })).toBeTruthy()
  })

  it('has no count when everything is read', () => {
    setup('seller', { items: [item('a', { readAt: '2026-11-04T10:00:00Z' })], unread: 0 })
    render(<NotificationBell />)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('opens a list with title, text and time, unread first marked', async () => {
    setup('seller', {
      items: [
        item('a', { title: 'New sale', body: 'Kofi bought SQL.' }),
        item('b', { readAt: '2026-11-04T10:00:00Z' }),
      ],
      unread: 1,
    })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    const panel = await screen.findByRole('dialog', { name: 'Notifications' })
    expect(within(panel).getByText('New sale')).toBeTruthy()
    expect(within(panel).getByText('Kofi bought SQL.')).toBeTruthy()
    expect(within(panel).getAllByText('just now')).toHaveLength(2)
    expect(within(panel).getAllByLabelText('Unread')).toHaveLength(1)
  })

  it('refreshes the list when it opens', async () => {
    setup('admin', { items: [item('x', { audience: 'admin' })], unread: 1 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await waitFor(() =>
      expect(api.listNotifications).toHaveBeenCalledWith(expect.objectContaining({ audience: 'admin' })),
    )
  })

  it('marks one read when clicked, and leaves a read one alone', async () => {
    setup('seller', { items: [item('a'), item('b', { readAt: '2026-11-04T10:00:00Z' })], unread: 1 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = await screen.findByRole('dialog')

    fireEvent.click(within(panel).getByRole('button', { name: /Title b/ }))
    expect(api.markNotificationsRead).not.toHaveBeenCalled()

    fireEvent.click(within(panel).getByRole('button', { name: /Title a/ }))
    await waitFor(() =>
      expect(api.markNotificationsRead).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'seller', ids: ['a'] }),
      ),
    )
  })

  it('marks all read, and disables the button when there is nothing new', async () => {
    setup('seller', { items: [item('a'), item('b')], unread: 2 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = await screen.findByRole('dialog')

    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all read' }))
    await waitFor(() =>
      expect(api.markNotificationsRead).toHaveBeenCalledWith(
        expect.objectContaining({ audience: 'seller', ids: undefined }),
      ),
    )
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Mark all read' }).disabled).toBe(true))
  })

  it('shows the notifications of the open tab only', async () => {
    useNotifications.setState({
      items: {
        buyer: [],
        seller: [item('s', { title: 'Seller thing' })],
        admin: [item('a', { audience: 'admin', title: 'Admin thing' })],
      },
      unread: { buyer: 0, seller: 1, admin: 1 },
      loaded: { buyer: true, seller: true, admin: true },
    })
    api.listNotifications.mockImplementation(async ({ audience }) => ({
      items:
        audience === 'admin'
          ? [item('a', { audience: 'admin', title: 'Admin thing' })]
          : [item('s', { title: 'Seller thing' })],
    }))
    useNav.setState({ view: 'app', tab: 'admin', section: 'overview' })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Admin thing')).toBeTruthy()
    expect(within(panel).queryByText('Seller thing')).toBeNull()
  })

  it('tells a buyer who has not bought anything what to expect', async () => {
    setup('buyer', { items: [], unread: 0 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Nothing yet')).toBeTruthy()
  })

  it('says all caught up for a seller with nothing', async () => {
    setup('seller', { items: [], unread: 0 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(within(await screen.findByRole('dialog')).getByText('All caught up')).toBeTruthy()
  })

  it('says so when it cannot load, and shows skeletons while loading', async () => {
    setup('seller', { loaded: false, error: 'We could not reach the server.' })
    api.listNotifications.mockImplementation(() => new Promise(() => {}))
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(within(await screen.findByRole('dialog')).getByText('Could not load')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    setup('seller', { items: [item('a')], unread: 1 })
    render(<NotificationBell />)
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('does not show on the design system page, which has no audience', () => {
    useNav.setState({ view: 'ui', tab: null, section: null })
    const { container } = render(<NotificationBell />)
    expect(container.textContent).toBe('')
  })
})
