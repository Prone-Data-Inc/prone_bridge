// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { overview, paymentDetail } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getOverview: vi.fn(), getPayment: vi.fn() }))

const api = await import('@/api/seller.js')
const { useNav } = await import('@/stores/nav.js')
const { default: Overview } = await import('./Overview.jsx')

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'seller', section: 'home' })
  api.getOverview.mockResolvedValue(overview())
  api.getPayment.mockResolvedValue(paymentDetail())
})

const show = async () => {
  render(<Overview />)
  await screen.findByText('Checkout conversion')
}

describe('Overview', () => {
  it('shows the four numbers that matter, with how much each moved', async () => {
    await show()
    const stat = (label) =>
      screen
        .getAllByText(label, { selector: 'h3' })
        .map((heading) => heading.closest('article'))
        .find(Boolean)
    expect(within(stat('Volume')).getByText('$12,125.00')).toBeTruthy()
    expect(within(stat('Volume')).getByText('+31.5%')).toBeTruthy()
    expect(within(stat('You keep, after fees')).getByText('$11,787.67')).toBeTruthy()
    expect(within(stat('You keep, after fees')).getByText('2.8% goes to fees')).toBeTruthy()
    expect(within(stat('Payments')).getByText('255')).toBeTruthy()
    expect(within(stat('Payments')).getByText('+35.6%')).toBeTruthy()
  })

  it('moves a rate in points, not as a share of itself', async () => {
    await show()
    const conversion = screen.getByText('Checkout conversion').closest('article')
    expect(within(conversion).getByText('68.8%')).toBeTruthy()
    /* 68.8% against 72.4% is 3.6 points down */
    expect(within(conversion).getByText('-3.6%')).toBeTruthy()
  })

  it('shows no change when there is nothing to compare with', async () => {
    const empty = overview()
    for (const metric of Object.values(empty.kpis)) Object.assign(metric, { delta: null, previous: 0 })
    api.getOverview.mockResolvedValue(empty)
    await show()
    expect(screen.queryByText(/^[+-]\d/)).toBeNull()
  })

  it('asks for 30 days to begin with, and for another period when the seller chooses one', async () => {
    await show()
    expect(api.getOverview).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    await waitFor(() => expect(api.getOverview).toHaveBeenLastCalledWith({ days: 7 }))
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    await waitFor(() => expect(api.getOverview).toHaveBeenLastCalledWith({ days: 90 }))
  })

  it('points out what is worth a look, and goes to the page that fixes it', async () => {
    await show()
    const list = screen.getByRole('list', { name: 'Worth a look' })
    expect(within(list).getByText(/8 visitors from Kenya left because Mobile money is off/)).toBeTruthy()
    fireEvent.click(within(list).getByRole('button', { name: /Countries/ }))
    expect(window.location.hash).toBe('#/seller/countries')
  })

  it('says nothing about attention when there is none', async () => {
    api.getOverview.mockResolvedValue(overview({ attention: [] }))
    await show()
    expect(screen.queryByRole('list', { name: 'Worth a look' })).toBeNull()
  })

  it('shows what is waiting for a payout, and goes to the payouts page', async () => {
    await show()
    const card = screen.getByText('Next payout').closest('section')
    expect(within(card).getByText('$2,476.25')).toBeTruthy()
    expect(within(card).getByText('54 paid sales, after fees')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /Go to payouts/ }))
    expect(window.location.hash).toBe('#/seller/payouts')
  })

  it('says when nothing is waiting', async () => {
    api.getOverview.mockResolvedValue(
      overview({ balance: { owedUsdCents: 0, owedPayments: 0, realOwedUsdCents: 0, realOwedPayments: 0 } }),
    )
    await show()
    expect(screen.getByText('Nothing is waiting.')).toBeTruthy()
  })

  it('groups the smaller methods, so the donut never has more than four parts', async () => {
    await show()
    const card = screen.getByText('Payment methods').closest('section')
    expect(within(card).getByText('Mobile money')).toBeTruthy()
    expect(within(card).getByText('Other')).toBeTruthy()
    expect(within(card).queryByText('Cash voucher')).toBeNull()
    expect(within(card).queryByText('PayPal')).toBeNull()
  })

  it('ranks the countries', async () => {
    await show()
    const card = screen.getByText('Top countries').closest('section')
    const rows = within(card).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Côte d'Ivoire"),
      expect.stringContaining('Senegal'),
    ])
    expect(within(card).getByText('$3,264.00')).toBeTruthy()
  })

  it('lists the latest payments, and opens one', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Latest payments', hidden: true })
    expect(within(table).getByText('pb_AB12CD34EF56')).toBeTruthy()
    expect(within(table).getByText('Failed')).toBeTruthy()
    fireEvent.click(within(table).getByText('pb_AB12CD34EF56'))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(api.getPayment).toHaveBeenCalledWith('pay-1')
    expect(await screen.findByRole('heading', { name: 'Payment pb_AB12CD34EF56' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('goes to all payments', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: /All payments/ }))
    expect(window.location.hash).toBe('#/seller/payments')
  })

  it('welcomes a seller with no sales yet', async () => {
    const quiet = overview()
    quiet.kpis.payments = { value: 0, previous: 0, delta: null }
    quiet.kpis.gross = { value: 0, previous: 0, delta: null }
    api.getOverview.mockResolvedValue(quiet)
    render(<Overview />)
    expect(await screen.findByText('No sales yet')).toBeTruthy()
    expect(screen.getByText(/Share a payment link/)).toBeTruthy()
  })

  it('says what went wrong, and can try again', async () => {
    api.getOverview.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Overview />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    expect(screen.getByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('$12,125.00')).length).toBeGreaterThan(0)
  })
})
