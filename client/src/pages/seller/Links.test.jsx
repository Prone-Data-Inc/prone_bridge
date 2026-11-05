// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courses } from '../../../test/buyerData.js'
import { link, links } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getLinks: vi.fn(), createLink: vi.fn(), setLinkActive: vi.fn() }))
vi.mock('@/api/catalog.js', () => ({ listProducts: vi.fn(), listCountries: vi.fn() }))

const api = await import('@/api/seller.js')
const { ApiError } = await import('@/api/client.js')
const { useCatalog } = await import('@/stores/catalog.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Links } = await import('./Links.jsx')

const writeText = vi.fn(async () => {})

beforeEach(() => {
  useToasts.setState({ items: [] })
  useCatalog.setState({
    status: 'ready',
    error: null,
    merchant: { slug: 'pdl', name: 'Prone Data Learning' },
    products: courses,
    countries: [],
    ensure: async () => {},
  })
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  api.getLinks.mockResolvedValue(links())
  api.createLink.mockResolvedValue({ link: link({ id: 'l-2', code: 'abcd2345', title: 'New one' }) })
  api.setLinkActive.mockResolvedValue({ link: link({ active: false, state: 'paused' }) })
})

const show = async () => {
  render(<Links />)
  await screen.findByRole('list', { name: 'Payment links' })
}

const messages = () => useToasts.getState().items.map((item) => item.message)
const url = (code) => `${window.location.origin}${window.location.pathname}#/buyer/link/${code}`

describe('Payment links: the list', () => {
  it('shows each link with its course, its address and how it is doing', async () => {
    await show()
    const row = screen.getByText('Launch week').closest('li')
    expect(within(row).getByText('Active')).toBeTruthy()
    expect(within(row).getByText('AI for Work, $39.00')).toBeTruthy()
    expect(within(row).getByText(url('9n2pdmb6'))).toBeTruthy()
    const stats = within(row).getByText('Visitors').closest('dl')
    expect(within(stats).getByText('4')).toBeTruthy()
    expect(within(stats).getByText('25%')).toBeTruthy()
    expect(within(stats).getByText('$39.00')).toBeTruthy()
  })

  it('says what limits a link', async () => {
    api.getLinks.mockResolvedValue(links([link({ maxUses: 50, expiresAt: '2026-12-01T12:00:00.000Z' })]))
    await show()
    expect(screen.getByText(/Limit 50\. Ends Dec 1, 2026/)).toBeTruthy()
  })

  it('shows every state a link can be in', async () => {
    api.getLinks.mockResolvedValue(
      links([
        link({ id: 'a', title: 'A', state: 'active' }),
        link({ id: 'b', title: 'B', state: 'paused', active: false }),
        link({ id: 'c', title: 'C', state: 'expired' }),
        link({ id: 'd', title: 'D', state: 'full' }),
      ]),
    )
    await show()
    for (const [title, state] of [
      ['A', 'Active'],
      ['B', 'Paused'],
      ['C', 'Expired'],
      ['D', 'Full'],
    ]) {
      expect(within(screen.getByText(title).closest('li')).getByText(state)).toBeTruthy()
    }
  })

  it("copies a link's address, and says so", async () => {
    await show()
    fireEvent.click(within(screen.getByText('Launch week').closest('li')).getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(messages()).toContain('Link copied.'))
    expect(writeText).toHaveBeenCalledWith(url('9n2pdmb6'))
  })

  it('pauses a link, and says buyers can no longer use it', async () => {
    await show()
    fireEvent.click(within(screen.getByText('Launch week').closest('li')).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(messages()).toContain('Link paused. Buyers can no longer use it.'))
    expect(api.setLinkActive).toHaveBeenCalledWith('l-1', false)
    expect(api.getLinks.mock.calls.length).toBeGreaterThan(1)
  })

  it('resumes a paused link', async () => {
    api.getLinks.mockResolvedValue(links([link({ active: false, state: 'paused' })]))
    await show()
    fireEvent.click(within(screen.getByText('Launch week').closest('li')).getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(messages()).toContain('Link is active again.'))
    expect(api.setLinkActive).toHaveBeenCalledWith('l-1', true)
  })

  it('says why a link could not be changed', async () => {
    api.setLinkActive.mockRejectedValue(new Error('We could not find that link.'))
    await show()
    fireEvent.click(within(screen.getByText('Launch week').closest('li')).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(messages()).toContain('We could not find that link.'))
    expect(useToasts.getState().items.at(-1).tone).toBe('danger')
  })

  it('welcomes a seller with no links, with a way to make one', async () => {
    api.getLinks.mockResolvedValue(links([]))
    render(<Links />)
    expect(await screen.findByText('No payment links yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create your first link' }))
    expect(await screen.findByRole('dialog', { name: 'New payment link' })).toBeTruthy()
  })

  it('cannot make a link before the courses are known', async () => {
    useCatalog.setState({ products: [] })
    await show()
    expect(screen.getByRole('button', { name: 'New link' }).disabled).toBe(true)
  })

  it('says what went wrong loading, and can try again', async () => {
    api.getLinks.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Links />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'Payment links' })).toBeTruthy()
  })
})

describe('Payment links: making one', () => {
  const open = async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'New link' }))
    return screen.findByRole('dialog', { name: 'New payment link' })
  }

  it('offers the courses with their prices', async () => {
    const dialog = await open()
    const options = within(within(dialog).getByLabelText('Course'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual(['AI for Work, $39.00', 'SQL in Practice, $59.00', 'Workflow Automation, $49.00'])
  })

  it('makes the link with what was typed, then shows its address', async () => {
    const dialog = await open()
    fireEvent.change(within(dialog).getByLabelText('Course'), { target: { value: 'sql-in-practice' } })
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '  Launch week  ' } })
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Thanks.' } })
    fireEvent.change(within(dialog).getByLabelText('Limit'), { target: { value: '25' } })
    fireEvent.change(within(dialog).getByLabelText('Ends on'), { target: { value: '2026-12-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))

    await waitFor(() =>
      expect(api.createLink).toHaveBeenCalledWith({
        product: 'sql-in-practice',
        title: 'Launch week',
        note: 'Thanks.',
        maxUses: 25,
        expiresAt: '2026-12-01T23:59:59.000Z',
      }),
    )
    const ready = await screen.findByRole('dialog', { name: 'Your link is ready' })
    expect(within(ready).getByLabelText('Link').value).toBe(url('abcd2345'))
    expect(within(ready).getByText('AI for Work')).toBeTruthy()
    expect(api.getLinks.mock.calls.length).toBeGreaterThan(1)
  })

  it('sends nothing for what was left empty, and the first course by default', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    await waitFor(() => expect(api.createLink).toHaveBeenCalled())
    expect(api.createLink).toHaveBeenCalledWith({
      product: 'ai-for-work',
      title: undefined,
      note: undefined,
      maxUses: undefined,
      expiresAt: undefined,
    })
  })

  it('copies the new link from the ready dialog', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    const ready = await screen.findByRole('dialog', { name: 'Your link is ready' })
    fireEvent.click(within(ready).getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url('abcd2345')))
    fireEvent.click(within(ready).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows what the server did not accept, and keeps what was typed', async () => {
    api.createLink.mockRejectedValue(
      new ApiError(400, 'bad_request', 'Check the request and try again.', 'r-1', {
        expiresAt: 'Choose an end date in the future.',
      }),
    )
    const dialog = await open()
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Keep me' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(within(dialog).getByRole('alert').textContent).toBe('Choose an end date in the future.')
    expect(within(dialog).getByLabelText('Name').value).toBe('Keep me')
  })

  it('shows a plain message when the server could not be reached', async () => {
    api.createLink.mockRejectedValue(new ApiError(0, 'network_error', 'We could not reach the server.'))
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('We could not reach the server.')
  })

  it('cancels without making anything', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.createLink).not.toHaveBeenCalled()
  })

  it('does not take an end date before tomorrow', async () => {
    const dialog = await open()
    const min = within(dialog).getByLabelText('Ends on').getAttribute('min')
    expect(min > new Date().toISOString().slice(0, 10)).toBe(true)
  })
})
