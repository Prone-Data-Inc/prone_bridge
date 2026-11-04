// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/notifications.js', () => ({
  listNotifications: vi.fn(),
  getNotificationSummary: vi.fn(),
  markNotificationsRead: vi.fn(),
}))

const api = await import('@/api/notifications.js')
const { emitSignal } = await import('@/realtime/bus.js')
const { useNotifications, startNotifications } = await import('./notifications.js')
const { useSession } = await import('./session.js')
const { useToasts } = await import('./toasts.js')

const note = (id, over = {}) => ({
  id,
  audience: 'seller',
  kind: 'test',
  level: 'success',
  title: `Title ${id}`,
  body: `Body ${id}`,
  paymentId: null,
  readAt: null,
  createdAt: '2026-11-04T10:00:00.000Z',
  ...over,
})

const fresh = () =>
  useNotifications.setState({
    items: { buyer: [], seller: [], admin: [] },
    unread: { buyer: 0, seller: 0, admin: 0 },
    loaded: { buyer: false, seller: false, admin: false },
    error: null,
  })

beforeEach(() => {
  fresh()
  useToasts.setState({ items: [] })
  useSession.setState({ merchant: 'pdl', buyer: null })
  api.listNotifications.mockResolvedValue({ items: [] })
  api.getNotificationSummary.mockResolvedValue({ buyer: 0, seller: 0, admin: 0 })
  api.markNotificationsRead.mockResolvedValue({ marked: 1 })
})

describe('loading', () => {
  it('stores a list and remembers it was loaded', async () => {
    api.listNotifications.mockResolvedValue({ items: [note('a'), note('b')] })
    await useNotifications.getState().load('seller')

    expect(api.listNotifications).toHaveBeenCalledWith({
      audience: 'seller',
      limit: 20,
      merchant: 'pdl',
      buyer: undefined,
    })
    expect(useNotifications.getState().items.seller.map((item) => item.id)).toEqual(['a', 'b'])
    expect(useNotifications.getState().loaded.seller).toBe(true)
  })

  it('stores the unread counts of the three tabs', async () => {
    api.getNotificationSummary.mockResolvedValue({ buyer: 0, seller: 2, admin: 1 })
    await useNotifications.getState().loadSummary()
    expect(useNotifications.getState().unread).toEqual({ buyer: 0, seller: 2, admin: 1 })
  })

  it('keeps what it had and says so when the server cannot be reached', async () => {
    api.listNotifications.mockResolvedValueOnce({ items: [note('a')] })
    await useNotifications.getState().load('seller')
    api.listNotifications.mockRejectedValueOnce(new Error('We could not reach the server.'))
    await useNotifications.getState().load('seller')

    expect(useNotifications.getState().items.seller).toHaveLength(1)
    expect(useNotifications.getState().error).toBe('We could not reach the server.')
  })

  it('sends the buyer id once there is a buyer', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Ada' } })
    await useNotifications.getState().load('buyer')
    expect(api.listNotifications).toHaveBeenCalledWith(expect.objectContaining({ audience: 'buyer', buyer: 'b-1' }))
  })
})

describe('announcing', () => {
  it('does not announce what was there on the first load', async () => {
    api.listNotifications.mockResolvedValue({ items: [note('a'), note('b')] })
    await useNotifications.getState().load('seller', { announce: true })
    expect(useToasts.getState().items).toEqual([])
  })

  it('announces a new unread notification with its role, and not the old ones', async () => {
    api.listNotifications.mockResolvedValueOnce({ items: [note('a')] })
    await useNotifications.getState().load('seller')
    api.listNotifications.mockResolvedValueOnce({
      items: [note('b', { title: 'New sale', body: 'Kofi bought SQL.' }), note('a')],
    })
    await useNotifications.getState().load('seller', { announce: true })

    expect(useToasts.getState().items).toHaveLength(1)
    expect(useToasts.getState().items[0]).toMatchObject({
      eyebrow: 'Seller',
      title: 'New sale',
      message: 'Kofi bought SQL.',
      tone: 'success',
    })
  })

  it('does not announce a notification that is already read', async () => {
    await useNotifications.getState().load('admin')
    api.listNotifications.mockResolvedValueOnce({
      items: [note('r', { audience: 'admin', readAt: '2026-11-04T10:01:00.000Z' })],
    })
    await useNotifications.getState().load('admin', { announce: true })
    expect(useToasts.getState().items).toEqual([])
  })

  it('maps a warning to a warning toast', async () => {
    await useNotifications.getState().load('admin')
    api.listNotifications.mockResolvedValueOnce({
      items: [note('w', { audience: 'admin', level: 'warning', title: 'Review' })],
    })
    await useNotifications.getState().load('admin', { announce: true })
    expect(useToasts.getState().items[0]).toMatchObject({ eyebrow: 'Admin', tone: 'warning' })
  })
})

describe('reading', () => {
  beforeEach(async () => {
    api.listNotifications.mockResolvedValue({
      items: [note('a'), note('b'), note('c', { readAt: '2026-11-04T09:00:00.000Z' })],
    })
    api.getNotificationSummary.mockResolvedValue({ buyer: 0, seller: 2, admin: 0 })
    await useNotifications.getState().refresh('seller')
  })

  it('marks one notification read at once and tells the server', async () => {
    const pending = useNotifications.getState().markRead('seller', ['a'])
    expect(useNotifications.getState().items.seller.find((item) => item.id === 'a').readAt).toBeTruthy()
    expect(useNotifications.getState().unread.seller).toBe(1)
    await pending
    expect(api.markNotificationsRead).toHaveBeenCalledWith({
      audience: 'seller',
      ids: ['a'],
      merchant: 'pdl',
      buyer: undefined,
    })
  })

  it('marks everything of a tab read', async () => {
    await useNotifications.getState().markRead('seller')
    expect(useNotifications.getState().items.seller.every((item) => item.readAt)).toBe(true)
    expect(useNotifications.getState().unread.seller).toBe(0)
  })

  it('puts things back if the server refuses', async () => {
    api.markNotificationsRead.mockRejectedValue(new Error('nope'))
    await useNotifications.getState().markRead('seller')
    expect(useNotifications.getState().unread.seller).toBe(2)
    expect(useNotifications.getState().items.seller.filter((item) => !item.readAt)).toHaveLength(2)
    expect(useNotifications.getState().error).toBe('nope')
  })

  it('never lets the count go below zero', async () => {
    useNotifications.setState((state) => ({ unread: { ...state.unread, seller: 0 } }))
    await useNotifications.getState().markRead('seller')
    expect(useNotifications.getState().unread.seller).toBe(0)
  })
})

describe('live signals', () => {
  it('refreshes the audience a notification signal is for', async () => {
    await useNotifications.getState().handleSignal({ table: 'notifications', audience: 'admin' })
    expect(api.listNotifications).toHaveBeenCalledWith(expect.objectContaining({ audience: 'admin' }))
    expect(api.getNotificationSummary).toHaveBeenCalled()
  })

  it('ignores signals about other tables', async () => {
    await useNotifications.getState().handleSignal({ table: 'payments', status: 'succeeded' })
    expect(api.listNotifications).not.toHaveBeenCalled()
  })

  it('ignores a buyer notification that is for someone else', async () => {
    useSession.setState({ buyer: { id: 'me', name: 'Me' } })
    await useNotifications
      .getState()
      .handleSignal({ table: 'notifications', audience: 'buyer', buyerId: 'someone-else' })
    expect(api.listNotifications).not.toHaveBeenCalled()

    await useNotifications.getState().handleSignal({ table: 'notifications', audience: 'buyer', buyerId: 'me' })
    expect(api.listNotifications).toHaveBeenCalledWith(expect.objectContaining({ audience: 'buyer', buyer: 'me' }))
  })
})

describe('startNotifications', () => {
  it('loads every tab, then reacts to live signals until stopped', async () => {
    const stop = startNotifications()
    await vi.waitFor(() =>
      expect(useNotifications.getState().loaded).toEqual({ buyer: true, seller: true, admin: true }),
    )
    expect(api.getNotificationSummary).toHaveBeenCalled()

    api.listNotifications.mockClear()
    emitSignal({ table: 'notifications', audience: 'seller' })
    await vi.waitFor(() =>
      expect(api.listNotifications).toHaveBeenCalledWith(expect.objectContaining({ audience: 'seller' })),
    )

    stop()
    api.listNotifications.mockClear()
    emitSignal({ table: 'notifications', audience: 'seller' })
    expect(api.listNotifications).not.toHaveBeenCalled()
  })
})
