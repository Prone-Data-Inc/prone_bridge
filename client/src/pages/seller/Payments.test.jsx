// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, merchant, paymentDetail, sellerPayment } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getPayments: vi.fn(), getCountries: vi.fn(), getPayment: vi.fn() }))
vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../../../test/fakeGrid.jsx')).default }))

const api = await import('@/api/seller.js')
const { default: Payments } = await import('./Payments.jsx')

const list = (payments, total = payments.length) => ({ merchant, payments, total, shown: payments.length })

const two = [
  sellerPayment(),
  sellerPayment({
    id: 'pay-2',
    reference: 'pb_ZZ99YY88XX77',
    status: 'failed',
    amountUsdCents: 2900,
    netUsdCents: 2830,
    method: { id: 'card', label: 'Card', kind: 'card' },
    country: { code: 'GH', name: 'Ghana' },
    buyer: { id: 'b-2', name: 'Kofi Mensah', email: 'kofi@example.com' },
    link: { title: 'Launch week', code: '9n2pdmb6' },
  }),
]

beforeEach(() => {
  api.getPayments.mockResolvedValue(list(two))
  api.getCountries.mockResolvedValue(countries())
  api.getPayment.mockResolvedValue(paymentDetail())
})

const show = async () => {
  render(<Payments />)
  return screen.findByTestId('grid')
}

describe('Payments', () => {
  it('asks for every payment, the latest first, and hands them to the grid to sort and search', async () => {
    const grid = await show()
    expect(api.getPayments).toHaveBeenLastCalledWith({
      status: '',
      method: '',
      country: '',
      from: undefined,
      limit: 1000,
    })
    expect(grid.dataset).toMatchObject({ noun: 'payments', export: 'payments' })
    expect(within(grid).getAllByRole('row')).toHaveLength(3)
  })

  it('puts who, how it ended and how much first, and the rest after', async () => {
    const grid = await show()
    const heads = within(grid)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
    expect(heads).toEqual([
      'Payment',
      'Date',
      'Customer',
      'Status',
      'Price',
      'You receive',
      'Method',
      'Country',
      'Email',
      'Payment link',
    ])
  })

  it('writes each payment as a row a seller can read and export', async () => {
    const grid = await show()
    const first = within(grid).getAllByRole('row')[1]
    const cells = within(first)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(cells[0]).toBe('pb_AB12CD34EF56')
    expect(cells.slice(2, 8)).toEqual(['Aminata Koné', 'Paid', '39.00', '38.02', 'Mobile money', "Côte d'Ivoire"])
    expect(cells[8]).toBe('aminata.kone@example.com')
    const second = within(within(grid).getAllByRole('row')[2])
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(second[3]).toBe('Failed')
    expect(second[9]).toBe('Launch week')
  })

  it('filters on the server by status, method and country', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } })
    await waitFor(() => expect(api.getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' })))
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'card' } })
    await waitFor(() =>
      expect(api.getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', method: 'card' })),
    )
    await screen.findByRole('option', { name: 'Kenya' })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'KE' } })
    await waitFor(() =>
      expect(api.getPayments).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'failed', method: 'card', country: 'KE' }),
      ),
    )
  })

  it('offers the countries the seller serves', async () => {
    await show()
    await screen.findByRole('option', { name: 'Kenya' })
    const names = within(screen.getByLabelText('Country'))
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(names).toEqual(['All countries', 'Kenya', "Côte d'Ivoire", 'Guinea'])
  })

  it('filters by period, from a day the server understands', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '30' } })
    await waitFor(() => expect(api.getPayments.mock.lastCall[0].from).toMatch(/^\d{4}-\d{2}-\d{2}$/))
    const from = new Date(`${api.getPayments.mock.lastCall[0].from}T00:00:00Z`).getTime()
    expect(Math.abs(Date.now() - from - 30 * 86_400_000)).toBeLessThan(2 * 86_400_000)
  })

  it('clears the filters in one press', async () => {
    await show()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(api.getPayments).toHaveBeenLastCalledWith(expect.objectContaining({ status: '' })))
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('says when nothing matches, and offers to clear the filters', async () => {
    await show()
    api.getPayments.mockResolvedValue(list([]))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'refunded' } })
    expect(await screen.findByText('No payments match')).toBeTruthy()
    expect(screen.getByText('Try fewer filters or a longer period.')).toBeTruthy()
    api.getPayments.mockResolvedValue(list(two))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByTestId('grid')).toBeTruthy()
  })

  it('says when there are no payments at all', async () => {
    api.getPayments.mockResolvedValue(list([]))
    render(<Payments />)
    expect(await screen.findByText('No payments yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('says so when there are more payments than it shows', async () => {
    api.getPayments.mockResolvedValue(list(two, 1500))
    await show()
    expect(screen.getByText(/Showing the latest 2 of 1,500 payments/)).toBeTruthy()
  })

  it('says nothing about it when everything is shown', async () => {
    await show()
    expect(screen.queryByText(/Showing the latest/)).toBeNull()
  })

  it('opens a payment from its row', async () => {
    const grid = await show()
    fireEvent.click(within(grid).getAllByRole('row')[1])
    expect(await screen.findByRole('heading', { name: 'Payment pb_AB12CD34EF56' })).toBeTruthy()
    expect(api.getPayment).toHaveBeenCalledWith('pay-1')
  })

  it('says what went wrong, and can try again', async () => {
    api.getPayments.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Payments />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('grid')).toBeTruthy()
  })
})
