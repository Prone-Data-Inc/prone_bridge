// @vitest-environment jsdom
/* The three network pages: sellers, corridors and settlements. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { corridors, merchants, settlements } from '../../../test/adminData.js'

vi.mock('@/api/admin.js', () => ({
  getMerchants: vi.fn(),
  getCorridors: vi.fn(),
  setCorridor: vi.fn(),
  getSettlements: vi.fn(),
  runSettlement: vi.fn(),
}))

const api = await import('@/api/admin.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Merchants } = await import('./Merchants.jsx')
const { default: Corridors } = await import('./Corridors.jsx')
const { default: Settlements } = await import('./Settlements.jsx')

const messages = () => useToasts.getState().items.map((item) => item.message)
const stat = (label) => screen.getByText(label, { selector: 'h3' }).closest('article')
/* A status word is also an option of the picker next to it, so the badge is the one that is not an option. */
const badge = (root, label) =>
  within(root)
    .getAllByText(label)
    .find((element) => element.tagName !== 'OPTION')

beforeEach(() => {
  useToasts.setState({ items: [] })
  api.getMerchants.mockResolvedValue(merchants())
  api.getCorridors.mockResolvedValue(corridors())
  api.setCorridor.mockResolvedValue({ corridor: {} })
  api.getSettlements.mockResolvedValue(settlements())
  api.runSettlement.mockResolvedValue({ payouts: [{ amountUsdCents: 247_625 }], skipped: [] })
})

describe('Merchants', () => {
  const show = async () => {
    render(<Merchants />)
    await screen.findByText('All sellers')
  }

  it('totals the sellers, their volume and what they are owed', async () => {
    await show()
    expect(within(stat('Sellers')).getByText('2')).toBeTruthy()
    expect(within(stat('Sellers')).getByText('1 active')).toBeTruthy()
    expect(within(stat('Volume')).getByText('$14,325.00')).toBeTruthy()
    expect(within(stat('Volume')).getByText('345 paid sales')).toBeTruthy()
    expect(within(stat('Owed to sellers')).getByText('$2,476.25')).toBeTruthy()
  })

  it('lists each seller with its numbers, its status and what is held', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Sellers', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Prone Data Learning')).toBeTruthy()
    expect(within(rows[1]).getByText('Joined Aug 6, 2026')).toBeTruthy()
    expect(within(rows[1]).getByText('Active')).toBeTruthy()
    expect(within(rows[1]).getByText('$12,125.00')).toBeTruthy()
    expect(within(rows[1]).getByText('93%')).toBeTruthy()
    expect(within(rows[1]).getByText('$2,476.25')).toBeTruthy()
    expect(within(rows[2]).getByText('Paused')).toBeTruthy()
    expect(within(rows[2]).getByText('90%')).toBeTruthy()
  })

  it('asks for 30 days, then for the period chosen', async () => {
    await show()
    expect(api.getMerchants).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    await waitFor(() => expect(api.getMerchants).toHaveBeenLastCalledWith({ days: 7 }))
  })

  it('says so when there are no sellers', async () => {
    api.getMerchants.mockResolvedValue(merchants({ merchants: [] }))
    render(<Merchants />)
    expect(await screen.findByText('No sellers yet')).toBeTruthy()
  })

  it('shows an error with a way to try again', async () => {
    api.getMerchants.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Merchants />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('All sellers')).toBeTruthy()
  })
})

describe('Corridors', () => {
  const show = async () => {
    render(<Corridors />)
    await screen.findByRole('region', { name: 'Kenya' })
  }
  const health = (label) => screen.getByLabelText(label)

  it('groups the methods by country with how each one is doing', async () => {
    await show()
    const ci = screen.getByRole('region', { name: "Côte d'Ivoire" })
    expect(within(ci).getAllByRole('listitem')).toHaveLength(2)
    expect(within(ci).getByText('110 paid, 92% succeed, $4,290.00. 4 sellers use it.')).toBeTruthy()
    expect(within(ci).getByText('No payments in this period. 4 sellers use it.')).toBeTruthy()
    const kenya = screen.getByRole('region', { name: 'Kenya' })
    expect(badge(kenya, 'Down')).toBeTruthy()
    expect(within(kenya).getByText(/1 seller uses it/)).toBeTruthy()
    expect(badge(screen.getByRole('region', { name: 'Ghana' }), 'Slow')).toBeTruthy()
  })

  it('totals the corridors by health, and says all of this is simulated', async () => {
    await show()
    const fact = (label) => screen.getByText(label, { selector: 'dt' }).nextSibling.textContent
    expect(fact('Working')).toBe('2')
    expect(fact('Slow')).toBe('1')
    expect(fact('Down')).toBe('1')
    expect(screen.getByText(/All of this is simulated: no real provider is connected/)).toBeTruthy()
  })

  it('marks a corridor down, tells the admin the sellers were told, and reloads', async () => {
    await show()
    fireEvent.change(health("Health of Mobile money in Côte d'Ivoire"), { target: { value: 'down' } })
    await waitFor(() => expect(api.setCorridor).toHaveBeenCalledWith('CI', 'mobile_money', { status: 'down' }))
    await waitFor(() =>
      expect(messages()).toContain("Mobile money in Côte d'Ivoire is now marked down. Sellers that use it were told."),
    )
    await waitFor(() => expect(api.getCorridors).toHaveBeenCalledTimes(2))
  })

  it('shows the change at once, while the server confirms', async () => {
    let finish
    api.setCorridor.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await show()
    const select = health("Health of Mobile money in Côte d'Ivoire")
    fireEvent.change(select, { target: { value: 'degraded' } })
    await waitFor(() => expect(select.value).toBe('degraded'))
    expect(select.disabled).toBe(true)
    finish({ corridor: {} })
    await waitFor(() => expect(select.disabled).toBe(false))
  })

  it('pauses a method for everyone and opens it again', async () => {
    await show()
    const toggle = screen.getByRole('switch', { name: 'Mobile money in Kenya is open' })
    expect(toggle.checked).toBe(true)
    fireEvent.click(toggle)
    await waitFor(() => expect(api.setCorridor).toHaveBeenCalledWith('KE', 'mobile_money', { enabled: false }))
    await waitFor(() => expect(messages()).toContain('Mobile money in Kenya is paused. Sellers that use it were told.'))
  })

  it('shows the error and puts the control back when the change fails', async () => {
    api.setCorridor.mockRejectedValue(new Error('That method is not offered in that country.'))
    await show()
    const select = health('Health of USSD in Ghana')
    fireEvent.change(select, { target: { value: 'operational' } })
    await waitFor(() => expect(messages()).toContain('That method is not offered in that country.'))
    await waitFor(() => expect(select.value).toBe('degraded'))
  })

  it('can show only the corridors with a problem', async () => {
    await show()
    fireEvent.click(screen.getByRole('switch', { name: 'Only show problems' }))
    expect(screen.queryByRole('region', { name: "Côte d'Ivoire" })).toBeNull()
    expect(screen.getByRole('region', { name: 'Kenya' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Ghana' })).toBeTruthy()
  })

  it('says every corridor is working when none has a problem', async () => {
    api.getCorridors.mockResolvedValue(corridors({ corridors: corridors().corridors.slice(0, 2) }))
    render(<Corridors />)
    await screen.findByRole('region', { name: "Côte d'Ivoire" })
    fireEvent.click(screen.getByRole('switch', { name: 'Only show problems' }))
    expect(screen.getByText('Every corridor is working.')).toBeTruthy()
  })

  it('says so when there are no corridors yet', async () => {
    api.getCorridors.mockResolvedValue(corridors({ corridors: [], summary: { operational: 0, degraded: 0, down: 0 } }))
    render(<Corridors />)
    expect(await screen.findByText('No corridors yet')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Only show problems' })).toBeNull()
  })

  it('asks for 30 days, then for the period chosen', async () => {
    await show()
    expect(api.getCorridors).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    await waitFor(() => expect(api.getCorridors).toHaveBeenLastCalledWith({ days: 90 }))
  })
})

describe('Settlements', () => {
  const show = async () => {
    render(<Settlements />)
    await screen.findByText('Waiting for a payout')
  }

  it('totals what is owed, on its way and paid, and how many went through PayPal', async () => {
    await show()
    expect(within(stat('Owed to sellers')).getByText('$6,000.00')).toBeTruthy()
    expect(within(stat('Owed to sellers')).getByText('140 paid sales, after fees')).toBeTruthy()
    expect(within(stat('On its way')).getByText('$74.50')).toBeTruthy()
    expect(within(stat('Paid out')).getByText('$25,107.91')).toBeTruthy()
    expect(within(stat('Paid out')).getByText('2 through PayPal, 1 failed')).toBeTruthy()
  })

  it('says payouts of local methods are simulated', async () => {
    await show()
    expect(screen.getByText(/Payouts of local methods and of the demo history are simulated/)).toBeTruthy()
  })

  it('lists what each seller is owed with a button to pay it out', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Owed by seller', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Prone Data Learning')).toBeTruthy()
    expect(within(rows[1]).getByText('$2,476.25')).toBeTruthy()
    expect(within(rows[2]).getByText('$3,523.75')).toBeTruthy()
  })

  it('pays one seller, says how much went out, and reloads', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Owed by seller', hidden: true })
    fireEvent.click(within(within(table).getAllByRole('row')[1]).getByRole('button', { name: 'Pay out' }))
    await waitFor(() => expect(api.runSettlement).toHaveBeenCalledWith('pdl'))
    await waitFor(() => expect(messages()).toContain('$2,476.25 paid out to Prone Data Learning.'))
    await waitFor(() => expect(api.getSettlements).toHaveBeenCalledTimes(2))
  })

  it('says when there was nothing to pay', async () => {
    api.runSettlement.mockResolvedValue({ payouts: [], skipped: [] })
    await show()
    const table = screen.getByRole('table', { name: 'Owed by seller', hidden: true })
    fireEvent.click(within(within(table).getAllByRole('row')[2]).getByRole('button', { name: 'Pay out' }))
    await waitFor(() => expect(messages()).toContain('Nothing to pay out for Savane Studio.'))
  })

  it('shows the reason when paying fails, and lets the admin try again', async () => {
    api.runSettlement.mockRejectedValue(new Error('We could not find that seller.'))
    await show()
    const table = screen.getByRole('table', { name: 'Owed by seller', hidden: true })
    const button = within(within(table).getAllByRole('row')[1]).getByRole('button', { name: 'Pay out' })
    fireEvent.click(button)
    await waitFor(() => expect(messages()).toContain('We could not find that seller.'))
    await waitFor(() => expect(button.disabled).toBe(false))
  })

  it('lists every payout with its seller, type and status', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Payouts', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('po_AB12CD34')).toBeTruthy()
    expect(within(rows[1]).getByText('Simulated')).toBeTruthy()
    expect(within(rows[1]).getByText('Paid')).toBeTruthy()
    expect(within(rows[2]).getByText('PayPal sandbox')).toBeTruthy()
    expect(within(rows[2]).getByText('On its way')).toBeTruthy()
  })

  it('says every seller is paid up when nothing is owed', async () => {
    api.getSettlements.mockResolvedValue(settlements({ owed: [] }))
    render(<Settlements />)
    expect(await screen.findByText('Every seller is paid up')).toBeTruthy()
  })
})
