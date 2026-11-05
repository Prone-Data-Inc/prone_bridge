// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentDetail, sellerPayment, timeline } from '../../../test/sellerData.js'

vi.mock('@/api/seller.js', () => ({ getPayment: vi.fn() }))

const api = await import('@/api/seller.js')
const { default: PaymentDetail } = await import('./PaymentDetail.jsx')

beforeEach(() => api.getPayment.mockResolvedValue(paymentDetail()))

const show = async (props = {}) => {
  const onClose = vi.fn()
  render(<PaymentDetail id="pay-1" onClose={onClose} {...props} />)
  await screen.findByRole('heading', { name: /^Payment pb_/ })
  return { onClose, dialog: screen.getByRole('dialog') }
}

const detail = (dialog, term) => within(dialog).getByText(term).closest('div').querySelector('dd')

describe('PaymentDetail', () => {
  it('asks for the payment it was given, and says what it is while it loads', async () => {
    let release
    api.getPayment.mockReturnValue(new Promise((resolve) => (release = resolve)))
    render(<PaymentDetail id="pay-9" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeTruthy()
    expect(api.getPayment).toHaveBeenCalledWith('pay-9')
    release(paymentDetail())
    expect(await screen.findByRole('heading', { name: 'Payment pb_AB12CD34EF56' })).toBeTruthy()
  })

  it('shows what the buyer paid in their money, what the seller receives and the fee', async () => {
    const { dialog } = await show()
    expect(detail(dialog, 'Price').textContent).toBe('$39.00')
    expect(detail(dialog, 'You receive').textContent).toBe('$38.02')
    expect(detail(dialog, 'ProneBridge fee').textContent).toBe('$0.98')
    expect(detail(dialog, 'Buyer paid').textContent).toBe('XOF 23,400')
    expect(detail(dialog, 'Method').textContent).toBe('Mobile money')
    expect(detail(dialog, 'Country').textContent).toBe("Côte d'Ivoire")
    expect(detail(dialog, 'Course').textContent).toBe('AI for Work')
    expect(detail(dialog, 'Customer').textContent).toContain('aminata.kone@example.com')
  })

  it('labels a simulated payment as simulated, and one through PayPal as the sandbox', async () => {
    const { dialog } = await show()
    expect(within(dialog).getByText('Simulated')).toBeTruthy()
    expect(within(dialog).getByText('Paid')).toBeTruthy()
  })

  it('shows a card payment with its brand and last four digits, in dollars only', async () => {
    api.getPayment.mockResolvedValue(
      paymentDetail({
        payment: sellerPayment({
          provider: 'paypal',
          simulated: false,
          displayCurrency: 'USD',
          displayAmountMinor: 3900,
          method: { id: 'card', label: 'Card', kind: 'card' },
          card: { brand: 'visa', last4: '1881' },
        }),
      }),
    )
    const { dialog } = await show()
    expect(within(dialog).getByText('PayPal sandbox')).toBeTruthy()
    expect(detail(dialog, 'Method').textContent).toBe('Visa ending 1881')
    expect(within(dialog).queryByText('Buyer paid')).toBeNull()
  })

  it('says why a payment failed, and ends its story there', async () => {
    api.getPayment.mockResolvedValue(
      paymentDetail({
        payment: sellerPayment({
          status: 'failed',
          failureCode: 'insufficient_funds',
          failureMessage: 'The balance was too low.',
        }),
        timeline: [
          timeline[0],
          {
            type: 'failed',
            label: 'Payment failed',
            detail: 'The balance was too low.',
            actor: 'system',
            at: '2026-11-04T10:00:04.000Z',
          },
        ],
      }),
    )
    const { dialog } = await show()
    expect(within(dialog).getByText('Failed')).toBeTruthy()
    expect(within(dialog).getAllByText(/The balance was too low\./).length).toBe(2)
    expect(detail(dialog, 'Payout').textContent).toBe('Not applicable')
  })

  it('says whether a paid sale has been paid out', async () => {
    const { dialog } = await show()
    expect(detail(dialog, 'Payout').textContent).toBe('Waiting for a payout')
  })

  it('says a paid out sale is paid out', async () => {
    api.getPayment.mockResolvedValue(paymentDetail({ payment: sellerPayment({ paidOut: true }) }))
    const { dialog } = await show()
    expect(detail(dialog, 'Payout').textContent).toBe('Paid out')
  })

  it('shows the payment link a sale came through', async () => {
    api.getPayment.mockResolvedValue(
      paymentDetail({ payment: sellerPayment({ link: { title: 'Launch week', code: '9n2pdmb6' } }) }),
    )
    const { dialog } = await show()
    expect(detail(dialog, 'Payment link').textContent).toBe('Launch week')
  })

  it('tells the story of the payment, step by step', async () => {
    const { dialog } = await show()
    const steps = within(dialog).getAllByRole('listitem')
    expect(steps.map((step) => step.querySelector('p').textContent)).toEqual(['Payment started', 'Payment received'])
  })

  it('closes from the footer and from the corner', async () => {
    const { dialog, onClose } = await show()
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[1])
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says what went wrong, and can try again', async () => {
    api.getPayment.mockRejectedValueOnce(new Error('We could not find that payment.'))
    render(<PaymentDetail id="pay-1" onClose={() => {}} />)
    expect(await screen.findByText('We could not find that payment.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Payment pb_AB12CD34EF56' })).toBeTruthy()
  })
})
