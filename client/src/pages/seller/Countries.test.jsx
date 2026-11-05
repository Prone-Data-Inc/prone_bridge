// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getCountries: vi.fn(), setMethod: vi.fn() }))

const api = await import('@/api/seller.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Countries } = await import('./Countries.jsx')

beforeEach(() => {
  useToasts.setState({ items: [] })
  api.getCountries.mockResolvedValue(countries())
  api.setMethod.mockResolvedValue({ countryCode: 'KE', methodId: 'mobile_money', enabled: true })
})

const show = async () => {
  render(<Countries />)
  await screen.findByRole('region', { name: 'Kenya' })
}

const card = (name) => screen.getByRole('region', { name })
const switchOf = (name) => screen.getByRole('switch', { name })
const messages = () => useToasts.getState().items.map((item) => item.message)

describe('Countries', () => {
  it('asks for 30 days, and for another period when the seller chooses one', async () => {
    await show()
    expect(api.getCountries).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    await waitFor(() => expect(api.getCountries).toHaveBeenLastCalledWith({ days: 90 }))
  })

  it('puts the biggest country first, and the ones with no sales last', async () => {
    await show()
    const names = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(names).toEqual(["Côte d'Ivoire", 'Kenya', 'Guinea'])
  })

  it('sums the countries up: how many are open, how many visitors, how many paid', async () => {
    await show()
    const facts = screen.getByText('Countries open').closest('dl')
    expect(within(facts).getByText('2 of 3')).toBeTruthy()
    expect(within(facts).getByText('120')).toBeTruthy()
    expect(within(facts).getByText('72')).toBeTruthy()
    expect(within(facts).getByText('60.0% of visitors')).toBeTruthy()
  })

  it('shows how each country did, and whether it is open', async () => {
    await show()
    const kenya = card('Kenya')
    expect(within(kenya).getByText('East Africa. Buyers pay in KES.')).toBeTruthy()
    expect(within(kenya).getByText('Open')).toBeTruthy()
    expect(within(kenya).getByText('20')).toBeTruthy()
    expect(within(kenya).getByText('25%')).toBeTruthy()
    expect(within(kenya).getByText('$195.00')).toBeTruthy()
    expect(within(card('Guinea')).getByText('Closed')).toBeTruthy()
    expect(within(card('Guinea')).getByText('None')).toBeTruthy()
  })

  it('says where visitors gave up, in plain words', async () => {
    await show()
    const kenya = card('Kenya')
    expect(within(kenya).getByRole('img', { name: '12 visitors left without paying' })).toBeTruthy()
    expect(within(kenya).getByText('Left at the country: 1')).toBeTruthy()
    expect(within(kenya).getByText('Had no method they use: 8')).toBeTruthy()
    expect(within(kenya).getByText('Left at payment: 3')).toBeTruthy()
    expect(within(card('Guinea')).queryByRole('img')).toBeNull()
    expect(within(card("Côte d'Ivoire")).queryByText(/Had no method/)).toBeNull()
  })

  it('lists every method with what it did, labeled for what it is', async () => {
    await show()
    const kenya = card('Kenya')
    expect(within(kenya).getAllByText('Simulated').length).toBeGreaterThan(0)
    expect(within(kenya).getByText('PayPal sandbox')).toBeTruthy()
    expect(within(kenya).getByText('9 paid, 90% succeed, $351.00')).toBeTruthy()
    expect(within(kenya).getByText('No payments in this period')).toBeTruthy()
  })

  it('shows a slow or down method, and one ProneBridge has not opened', async () => {
    await show()
    const kenya = card('Kenya')
    expect(within(kenya).getByText('Slow')).toBeTruthy()
    expect(within(kenya).getByText('ProneBridge has not opened this here yet')).toBeTruthy()
    expect(within(kenya).queryByRole('switch', { name: 'Cash voucher in Kenya' })).toBeNull()
  })

  it('shows which methods are on', async () => {
    await show()
    expect(switchOf('Mobile money in Kenya').checked).toBe(false)
    expect(switchOf('Card in Kenya').checked).toBe(true)
    expect(switchOf("Mobile money in Côte d'Ivoire").checked).toBe(true)
  })

  it('turns a method on at once, tells the server, then confirms', async () => {
    let release
    api.setMethod.mockReturnValue(new Promise((resolve) => (release = resolve)))
    await show()
    fireEvent.click(switchOf('Mobile money in Kenya'))

    /* on screen before the server answers, and not pressable twice */
    expect(api.setMethod).toHaveBeenCalledWith('KE', 'mobile_money', true)
    expect(switchOf('Mobile money in Kenya').checked).toBe(true)
    expect(switchOf('Mobile money in Kenya').disabled).toBe(true)

    api.getCountries.mockResolvedValue({
      ...countries(),
      countries: countries().countries.map((country) =>
        country.code === 'KE'
          ? {
              ...country,
              methods: country.methods.map((method) =>
                method.id === 'mobile_money' ? { ...method, enabled: true, live: true } : method,
              ),
            }
          : country,
      ),
    })
    await act(async () => release({ countryCode: 'KE', methodId: 'mobile_money', enabled: true }))
    await waitFor(() => expect(messages()).toContain('Mobile money is on in Kenya.'))
    expect(switchOf('Mobile money in Kenya').checked).toBe(true)
    expect(switchOf('Mobile money in Kenya').disabled).toBe(false)
    expect(api.getCountries.mock.calls.length).toBeGreaterThan(1)
  })

  it('turns a method off', async () => {
    await show()
    fireEvent.click(switchOf('Card in Kenya'))
    expect(api.setMethod).toHaveBeenCalledWith('KE', 'card', false)
    await waitFor(() => expect(messages()).toContain('Card is off in Kenya.'))
  })

  it('puts the switch back and says why when the server refuses', async () => {
    api.setMethod.mockRejectedValue(new Error('ProneBridge has not opened that method in that country yet.'))
    await show()
    fireEvent.click(switchOf('Mobile money in Kenya'))
    await waitFor(() => expect(messages()).toContain('ProneBridge has not opened that method in that country yet.'))
    expect(useToasts.getState().items.at(-1).tone).toBe('danger')
    expect(switchOf('Mobile money in Kenya').checked).toBe(false)
    expect(switchOf('Mobile money in Kenya').disabled).toBe(false)
  })

  it('says what went wrong loading, and can try again', async () => {
    api.getCountries.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Countries />)
    expect(await screen.findByText('We could not load this')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Kenya' })).toBeTruthy()
  })
})
