// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/seller.js', () => ({ resolveLink: vi.fn() }))
vi.mock('./checkout/Checkout.jsx', () => ({
  default: ({ param, link }) => (
    <div data-testid="checkout" data-param={param} data-code={link?.code} data-title={link?.title} />
  ),
}))

const api = await import('@/api/seller.js')
const { ApiError } = await import('@/api/client.js')
const { default: LinkPage } = await import('./LinkPage.jsx')

const resolved = (over = {}) => ({
  link: {
    code: '9n2pdmb6',
    title: 'Launch week',
    note: 'Thanks for joining.',
    state: 'active',
    available: true,
    reason: null,
    product: { slug: 'ai-for-work', title: 'AI for Work' },
    merchant: { slug: 'pdl', name: 'Prone Data Learning' },
    ...over,
  },
})

beforeEach(() => {
  window.location.hash = ''
  api.resolveLink.mockResolvedValue(resolved())
})

describe('LinkPage', () => {
  it('opens the checkout for the course the link points to, carrying the link', async () => {
    render(<LinkPage param="9n2pdmb6" />)
    const checkout = await screen.findByTestId('checkout')
    expect(api.resolveLink).toHaveBeenCalledWith('9n2pdmb6')
    expect(checkout.dataset).toMatchObject({ param: 'ai-for-work', code: '9n2pdmb6', title: 'Launch week' })
  })

  it('shows a placeholder while it finds out', async () => {
    let release
    api.resolveLink.mockReturnValue(new Promise((resolve) => (release = resolve)))
    render(<LinkPage param="9n2pdmb6" />)
    expect(screen.queryByTestId('checkout')).toBeNull()
    expect(screen.queryByText('This link cannot be used')).toBeNull()
    release(resolved())
    expect(await screen.findByTestId('checkout')).toBeTruthy()
  })

  it.each([
    ['paused', 'The seller has paused this link.'],
    ['expired', 'This link has expired.'],
    ['full', 'This link has reached its limit.'],
  ])('says so when a link is %s, and sends the buyer to the courses', async (state, reason) => {
    api.resolveLink.mockResolvedValue(resolved({ state, available: false, reason }))
    render(<LinkPage param="9n2pdmb6" />)
    expect(await screen.findByText('This link cannot be used')).toBeTruthy()
    expect(screen.getByText(reason)).toBeTruthy()
    expect(screen.queryByTestId('checkout')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See all courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('says it cannot find a link that does not exist, or is not a link', async () => {
    api.resolveLink.mockRejectedValue(new ApiError(404, 'not_found', 'We could not find that link.'))
    const { unmount } = render(<LinkPage param="zzzzzzzz" />)
    expect(await screen.findByText('We could not find that link.')).toBeTruthy()
    unmount()

    api.resolveLink.mockRejectedValue(new ApiError(400, 'bad_request', 'That is not a payment link.'))
    render(<LinkPage param="NOPE" />)
    expect(await screen.findByText('We could not find that link.')).toBeTruthy()
  })

  it('says what went wrong when the server cannot be reached', async () => {
    api.resolveLink.mockRejectedValue(new ApiError(0, 'network_error', 'We could not reach the server.'))
    render(<LinkPage param="9n2pdmb6" />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
  })

  it('starts again from the beginning when the code changes', async () => {
    const { rerender } = render(<LinkPage param="9n2pdmb6" />)
    await screen.findByTestId('checkout')
    api.resolveLink.mockResolvedValue(
      resolved({ code: 'abcd2345', title: 'Other', product: { slug: 'prompt-craft', title: 'Prompt Craft' } }),
    )
    rerender(<LinkPage param="abcd2345" />)
    await waitFor(() => expect(screen.getByTestId('checkout').dataset.code).toBe('abcd2345'))
    expect(screen.getByTestId('checkout').dataset.param).toBe('prompt-craft')
    expect(api.resolveLink).toHaveBeenCalledTimes(2)
  })
})
