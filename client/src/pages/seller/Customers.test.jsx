// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { customerDetail, customers } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getCustomers: vi.fn(), getCustomer: vi.fn() }))
vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../../../test/fakeGrid.jsx')).default }))

const api = await import('@/api/seller.js')
const { default: Customers } = await import('./Customers.jsx')

beforeEach(() => {
  api.getCustomers.mockResolvedValue(customers())
  api.getCustomer.mockResolvedValue(customerDetail())
})

describe('Customers', () => {
  it('lists the people who bought, with what they spent and when they last bought', async () => {
    render(<Customers />)
    const grid = await screen.findByTestId('grid')
    expect(api.getCustomers).toHaveBeenCalledWith({ limit: 1000 })
    expect(grid.dataset).toMatchObject({ noun: 'customers', export: 'customers' })
    const heads = within(grid)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
    expect(heads).toEqual(['Customer', 'Email', 'Country', 'Orders', 'Spent', 'Courses', 'Last purchase'])

    const first = within(within(grid).getAllByRole('row')[1])
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(first).toEqual([
      'Aminata Koné',
      'aminata.kone@example.com',
      "Côte d'Ivoire",
      '3',
      '117.00',
      '3',
      'Nov 4, 2026',
    ])
  })

  it('opens a customer with what they spent, their courses and their payments', async () => {
    render(<Customers />)
    fireEvent.click(within(await screen.findByTestId('grid')).getAllByRole('row')[1])

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('$117.00')).toBeTruthy()
    expect(api.getCustomer).toHaveBeenCalledWith('b-1')
    expect(within(dialog).getByRole('heading', { name: 'Aminata Koné' })).toBeTruthy()
    expect(within(dialog).getByText(/aminata\.kone@example\.com\. Côte d'Ivoire\./)).toBeTruthy()

    const courses = within(dialog).getByRole('heading', { name: 'Courses' }).closest('section')
    expect(within(courses).getByText('AI for Work')).toBeTruthy()
    const table = within(dialog).getByRole('table', { name: 'Payments by Aminata Koné', hidden: true })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('Refunded')).toBeTruthy()
  })

  it('says when a customer has nothing unlocked', async () => {
    api.getCustomer.mockResolvedValue({ ...customerDetail(), courses: [] })
    render(<Customers />)
    fireEvent.click(within(await screen.findByTestId('grid')).getAllByRole('row')[1])
    expect(await screen.findByText('Nothing unlocked yet.')).toBeTruthy()
  })

  it('closes the customer', async () => {
    render(<Customers />)
    fireEvent.click(within(await screen.findByTestId('grid')).getAllByRole('row')[1])
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('$117.00')
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('welcomes a seller with no customers yet', async () => {
    api.getCustomers.mockResolvedValue({ ...customers(), customers: [], total: 0 })
    render(<Customers />)
    expect(await screen.findByText('No customers yet')).toBeTruthy()
    expect(screen.queryByTestId('grid')).toBeNull()
  })

  it('says what went wrong, and can try again', async () => {
    api.getCustomers.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Customers />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('grid')).toBeTruthy()
  })
})
