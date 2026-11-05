// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { payout, payoutDetail, payouts } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({
  getPayouts: vi.fn(),
  getPayout: vi.fn(),
  runPayout: vi.fn(),
  refreshPayout: vi.fn(),
}))

const api = await import('@/api/seller.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Payouts } = await import('./Payouts.jsx')

beforeEach(() => {
  useToasts.setState({ items: [] })
  api.getPayouts.mockResolvedValue(payouts())
  api.getPayout.mockResolvedValue(payoutDetail())
  api.runPayout.mockResolvedValue({ payouts: [payout({ id: 'po-3', amountUsdCents: 247_625 })], skipped: [] })
  api.refreshPayout.mockResolvedValue({ payout: payout() })
})

const show = async () => {
  render(<Payouts />)
  await screen.findByText('Waiting for a payout')
}

const messages = () => useToasts.getState().items.map((item) => item.message)
const stat = (label) => screen.getByText(label, { selector: 'h3' }).closest('article')

describe('Payouts', () => {
  it('shows what is waiting, what is on its way and what has been paid', async () => {
    await show()
    expect(within(stat('Waiting for a payout')).getByText('$2,476.25')).toBeTruthy()
    expect(within(stat('Waiting for a payout')).getByText('54 paid sales, after fees')).toBeTruthy()
    expect(within(stat('On its way')).getByText('$0.00')).toBeTruthy()
    expect(within(stat('Paid out')).getByText('$25,107.91')).toBeTruthy()
    expect(within(stat('Paid out')).getByText('12 payouts')).toBeTruthy()
  })

  it('says nothing is waiting when nothing is', async () => {
    api.getPayouts.mockResolvedValue(
      payouts({ balance: { owedUsdCents: 0, owedPayments: 0, realOwedUsdCents: 0, realOwedPayments: 0 } }),
    )
    await show()
    expect(within(stat('Waiting for a payout')).getByText('Nothing is waiting.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pay out now' }).disabled).toBe(true)
  })

  it('lists the payouts with their type and status', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Payouts', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('po_AB12CD34')).toBeTruthy()
    expect(within(rows[1]).getByText('Oct 22, 2026 to Oct 29, 2026')).toBeTruthy()
    expect(within(rows[1]).getByText('Simulated')).toBeTruthy()
    expect(within(rows[1]).getByText('Paid')).toBeTruthy()
    expect(within(rows[2]).getByText('PayPal sandbox')).toBeTruthy()
    expect(within(rows[2]).getByText('On its way')).toBeTruthy()
    expect(within(rows[2]).getByText('$74.50')).toBeTruthy()
    expect(within(rows[2]).getByText('Nov 4, 2026')).toBeTruthy()
  })

  it('says whether payouts are real sandbox payouts or simulated', async () => {
    await show()
    expect(screen.getByText('Payouts are simulated in this demo. Nothing is sent to a bank or a wallet.')).toBeTruthy()
  })

  it('says sales through PayPal are paid out through PayPal once a payout account is set', async () => {
    api.getPayouts.mockResolvedValue(payouts({ paypal: { available: true, payoutAccountSet: true } }))
    await show()
    expect(screen.getByText(/paid out through PayPal Payouts, in the PayPal sandbox/)).toBeTruthy()
  })

  it('pays out what is owed, says how much is on its way, and reloads', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Pay out now' }))
    await waitFor(() => expect(messages()).toContain('$2,476.25 is on its way to you.'))
    expect(api.runPayout).toHaveBeenCalledTimes(1)
    expect(useToasts.getState().items.at(-1).tone).toBe('success')
    expect(api.getPayouts.mock.calls.length).toBeGreaterThan(1)
  })

  it('adds up several payouts made at once', async () => {
    api.runPayout.mockResolvedValue({
      payouts: [payout({ amountUsdCents: 1000 }), payout({ id: 'po-4', amountUsdCents: 2500 })],
      skipped: [],
    })
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Pay out now' }))
    await waitFor(() => expect(messages()).toContain('$35.00 is on its way to you.'))
  })

  it('says when there was nothing to pay out', async () => {
    api.runPayout.mockResolvedValue({ payouts: [], skipped: [] })
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Pay out now' }))
    await waitFor(() => expect(messages()).toContain('Nothing to pay out yet.'))
  })

  it('says why a payout did not start, and presses again afterwards', async () => {
    api.runPayout.mockRejectedValueOnce(new Error('We could not reach PayPal. Try again in a moment.'))
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Pay out now' }))
    await waitFor(() => expect(messages()).toContain('We could not reach PayPal. Try again in a moment.'))
    expect(useToasts.getState().items.at(-1).tone).toBe('danger')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay out now' }).disabled).toBe(false))
  })

  it('opens a payout with the sales it covers', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Payouts', hidden: true })
    fireEvent.click(within(table).getByText('po_AB12CD34'))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('heading', { name: 'Payout po_AB12CD34' })).toBeTruthy()
    expect(api.getPayout).toHaveBeenCalledWith('po-1')
    expect(within(dialog).getByText('payouts@pdl.example')).toBeTruthy()
    expect(within(dialog).getByText('Oct 22, 2026 to Oct 29, 2026')).toBeTruthy()
    const sales = within(dialog).getByRole('table', { name: 'Sales in this payout', hidden: true })
    expect(within(sales).getByText('pb_AB12CD34EF56')).toBeTruthy()
    expect(within(sales).getByText('$38.02')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Check with PayPal' })).toBeNull()
  })

  it('lets a payout that is still on its way through PayPal be checked with PayPal', async () => {
    api.getPayout.mockResolvedValue(
      payoutDetail({
        payout: payout({
          id: 'po-2',
          reference: 'po_ZZ99YY88',
          status: 'processing',
          provider: 'paypal',
          simulated: false,
          paidAt: null,
        }),
      }),
    )
    await show()
    const table = screen.getByRole('table', { name: 'Payouts', hidden: true })
    fireEvent.click(within(table).getByText('po_ZZ99YY88'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check with PayPal' }))
    await waitFor(() => expect(api.refreshPayout).toHaveBeenCalledWith('po-2'))
  })

  it('explains a failed payout', async () => {
    api.getPayout.mockResolvedValue(
      payoutDetail({ payout: payout({ status: 'failed', failureCode: 'INSUFFICIENT_FUNDS', paidAt: null }) }),
    )
    await show()
    fireEvent.click(within(screen.getByRole('table', { name: 'Payouts', hidden: true })).getByText('po_AB12CD34'))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('insufficient funds')).toBeTruthy()
    expect(within(dialog).getByText('Failed')).toBeTruthy()
  })

  it('welcomes a seller with no payouts', async () => {
    api.getPayouts.mockResolvedValue(
      payouts({ payouts: [], totals: { paidUsdCents: 0, onItsWayUsdCents: 0, paidCount: 0 } }),
    )
    await show()
    expect(screen.getByText('No payouts yet')).toBeTruthy()
  })

  it('says what went wrong, and can try again', async () => {
    api.getPayouts.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Payouts />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Waiting for a payout')).toBeTruthy()
  })
})
