// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminPayment,
  assessment,
  blockedPayment,
  heldPayment,
  merchants,
  transactionDetail,
  transactions,
} from '../../../test/adminData.js'

vi.mock('@/api/admin.js', () => ({
  getTransactions: vi.fn(),
  getMerchants: vi.fn(),
  getTransaction: vi.fn(),
  approvePayment: vi.fn(),
  rejectPayment: vi.fn(),
}))
vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../../../test/fakeGrid.jsx')).default }))

const api = await import('@/api/admin.js')
const { default: Transactions } = await import('./Transactions.jsx')

beforeEach(() => {
  api.getTransactions.mockResolvedValue(transactions())
  api.getMerchants.mockResolvedValue(merchants())
  api.getTransaction.mockResolvedValue(transactionDetail())
  api.approvePayment.mockResolvedValue({ payment: {} })
})

const show = async () => {
  render(<Transactions />)
  return screen.findByTestId('grid')
}

describe('Transactions', () => {
  it('asks for every payment, the latest first, and hands them to the grid', async () => {
    const grid = await show()
    expect(api.getTransactions).toHaveBeenLastCalledWith({
      status: '',
      merchant: '',
      method: '',
      country: '',
      level: '',
      from: undefined,
      limit: 1000,
    })
    expect(grid.dataset).toMatchObject({ noun: 'payments', export: 'transactions' })
    expect(within(grid).getAllByRole('row')).toHaveLength(4)
  })

  it('puts the seller, the status and the risk next to each payment', async () => {
    const grid = await show()
    const heads = within(grid)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
    expect(heads).toEqual([
      'Payment',
      'Date',
      'Seller',
      'Status',
      'Risk',
      'Score',
      'Price',
      'Buyer',
      'Method',
      'Country',
      'Email',
    ])
    const rows = within(grid).getAllByRole('row')
    const cells = (row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    expect(cells(rows[2])).toEqual(
      expect.arrayContaining(['pb_HELD00000001', 'Prone Data Learning', 'In review', 'Medium', '40']),
    )
    expect(cells(rows[3])).toEqual(expect.arrayContaining(['Blocked', 'High', '100']))
  })

  it('says "Not scored" for a payment without a rating', async () => {
    api.getTransactions.mockResolvedValue(transactions([adminPayment({ risk: null })]))
    const grid = await show()
    expect(within(grid).getAllByText('Not scored')).toHaveLength(1)
  })

  it('filters by status, risk, seller and method, and clears the filters', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_review' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'in_review' })),
    )
    fireEvent.change(screen.getByLabelText('Risk'), { target: { value: 'high' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'high' })),
    )
    await screen.findByRole('option', { name: 'Prone Data Learning' })
    fireEvent.change(screen.getByLabelText('Seller'), { target: { value: 'pdl' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ merchant: 'pdl' })),
    )
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'card' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'card' })),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: '', level: '', merchant: '', method: '' }),
      ),
    )
  })

  it('offers the countries of the payments it has, and filters by one', async () => {
    await show()
    const select = screen.getByLabelText('Country')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All countries', "Côte d'Ivoire"])
    fireEvent.change(select, { target: { value: 'CI' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'CI' })),
    )
  })

  it('filters by period, as a day', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '7' } })
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      ),
    )
  })

  it('says how many of the payments are shown when there are more', async () => {
    api.getTransactions.mockResolvedValue(transactions(undefined, 5400))
    await show()
    expect(screen.getByText(/Showing the latest 3 of 5,400 payments/)).toBeTruthy()
  })

  it('says nothing matches when a filter finds nothing', async () => {
    await show()
    api.getTransactions.mockResolvedValue(transactions([]))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'refunded' } })
    expect(await screen.findByText('No payments match')).toBeTruthy()
  })

  it('says there are no payments yet', async () => {
    api.getTransactions.mockResolvedValue(transactions([]))
    render(<Transactions />)
    expect(await screen.findByText('No payments yet')).toBeTruthy()
  })

  it('opens a payment with its rating, the rules, and its timeline', async () => {
    const grid = await show()
    fireEvent.click(within(grid).getByText('pb_HELD00000001'))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_HELD00000001' })
    expect(api.getTransaction).toHaveBeenCalledWith('pay-held')
    expect(await within(dialog).findByText('Risk check')).toBeTruthy()
    expect(within(dialog).getByRole('img', { name: 'Risk score 40 out of 100, Medium' })).toBeTruthy()
    expect(within(dialog).getByText('Held for review.')).toBeTruthy()
    expect(within(dialog).getByText('Throwaway email')).toBeTruthy()
    expect(within(dialog).getByText('+40')).toBeTruthy()
    expect(within(dialog).getByText('The signals suggest a throwaway address was used.')).toBeTruthy()
    expect(within(dialog).getByText('Payment started')).toBeTruthy()
    expect(within(dialog).getByText('Held for a safety check')).toBeTruthy()
    expect(within(dialog).getByText('test.buyer@mailinator.com')).toBeTruthy()
  })

  it('lets the admin decide a held payment from its detail', async () => {
    const grid = await show()
    fireEvent.click(within(grid).getByText('pb_HELD00000001'))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_HELD00000001' })
    await within(dialog).findByText('Risk check')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    const decision = await screen.findByRole('dialog', { name: 'Approve this payment' })
    fireEvent.click(within(decision).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.approvePayment).toHaveBeenCalledWith('pay-held', undefined))
  })

  it('offers no decision for a payment that is not held', async () => {
    api.getTransaction.mockResolvedValue(
      transactionDetail({
        payment: blockedPayment(),
        assessment: assessment({ score: 100, level: 'high', decision: 'block' }),
      }),
    )
    const grid = await show()
    fireEvent.click(within(grid).getByText('pb_BLOCK0000001'))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_BLOCK0000001' })
    await within(dialog).findByText('Risk check')
    expect(within(dialog).getByText('Blocked at once.')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('says a payment scored after it settled was not held or blocked', async () => {
    api.getTransaction.mockResolvedValue(
      transactionDetail({
        payment: adminPayment(),
        assessment: assessment({ enforced: false, level: 'medium', decision: 'review' }),
      }),
    )
    const grid = await show()
    fireEvent.click(within(grid).getAllByRole('row')[1])
    const dialog = await screen.findByRole('dialog', { name: /Payment pb_/ })
    expect(
      await within(dialog).findByText(/Scored after the payment was settled, so nothing was held or blocked/),
    ).toBeTruthy()
  })

  it('says so when a payment was never scored', async () => {
    api.getTransaction.mockResolvedValue(transactionDetail({ payment: heldPayment(), assessment: null }))
    const grid = await show()
    fireEvent.click(within(grid).getByText('pb_HELD00000001'))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_HELD00000001' })
    expect(await within(dialog).findByText('This payment was not scored.')).toBeTruthy()
  })

  it('shows an error with a way to try again', async () => {
    api.getTransactions.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Transactions />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('grid')).toBeTruthy()
  })
})
