// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  countries,
  failedPayment,
  paymentOf,
  paypalFailed,
  paypalSucceeded,
  succeededPayment,
} from '../../../../test/buyerData.js'
import { useNav } from '@/stores/nav.js'
import { Failed, Paid, Pending } from './Result.jsx'

const [ivory, nigeria] = countries

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'buyer', section: 'checkout' })
})

const receipt = () => screen.getByText('Reference').closest('dl')

describe('Paid', () => {
  it('says the course is unlocked and shows a receipt in the currency the buyer paid in', () => {
    render(<Paid payment={succeededPayment()} place={ivory} />)
    expect(screen.getByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(screen.getByText('AI for Work is unlocked. A receipt is in your notifications.')).toBeTruthy()
    expect(within(receipt()).getByText('XOF 23,400')).toBeTruthy()
    expect(within(receipt()).getByText('Course price')).toBeTruthy()
    expect(within(receipt()).getByText('$39.00')).toBeTruthy()
    expect(within(receipt()).getByText('Mobile money (simulated)')).toBeTruthy()
    expect(within(receipt()).getByText('pb_AB12CD34EF56')).toBeTruthy()
  })

  it('uses the right decimals for the currency of the country', () => {
    render(
      <Paid payment={succeededPayment({ displayCurrency: 'NGN', displayAmountMinor: 5_850_000 })} place={nigeria} />,
    )
    expect(within(receipt()).getByText('NGN 58,500.00')).toBeTruthy()
  })

  it('shows a card payment as a US dollar payment, with the card, and no repeated price', () => {
    render(<Paid payment={paypalSucceeded()} place={ivory} />)
    expect(within(receipt()).getByText('USD 39.00')).toBeTruthy()
    expect(within(receipt()).queryByText('Course price')).toBeNull()
    expect(within(receipt()).getByText('Visa ending 1881 (PayPal sandbox)')).toBeTruthy()
  })

  it('names the brand of the card, and falls back to the method when there is no card', () => {
    const mastercard = paypalSucceeded({ card: { brand: 'mastercard', last4: '0011' } })
    const { unmount } = render(<Paid payment={mastercard} place={ivory} />)
    expect(within(receipt()).getByText('Mastercard ending 0011 (PayPal sandbox)')).toBeTruthy()
    unmount()

    render(<Paid payment={paypalSucceeded({ card: null, method: { id: 'paypal', label: 'PayPal' } })} place={ivory} />)
    expect(within(receipt()).getByText('PayPal (PayPal sandbox)')).toBeTruthy()
  })

  it('goes on to the course, or back to the courses', () => {
    render(<Paid payment={succeededPayment()} place={ivory} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
    expect(window.location.hash).toBe('#/buyer/course/ai-for-work')
    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('shows no date when there is none, rather than a wrong one', () => {
    render(<Paid payment={succeededPayment({ completedAt: null })} place={ivory} />)
    expect(within(receipt()).getByText('Date').nextElementSibling.textContent).toBe('')
  })
})

describe('Pending', () => {
  it('says PayPal is still confirming, with the reference, and promises to tell the buyer', () => {
    render(<Pending payment={paymentOf({ status: 'processing' })} />)
    expect(screen.getByRole('heading', { name: 'Payment pending' })).toBeTruthy()
    expect(
      screen.getByText('PayPal is still confirming your payment. We will tell you as soon as it goes through.'),
    ).toBeTruthy()
    expect(screen.getByText('pb_AB12CD34EF56')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })
})

describe('Failed', () => {
  it('says why, that nothing was charged, and can try again', () => {
    let tries = 0
    render(<Failed payment={failedPayment()} onRetry={() => (tries += 1)} />)
    expect(screen.getByRole('heading', { name: 'Payment did not go through' })).toBeTruthy()
    expect(screen.getByText('The balance was too low. Nothing was charged.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(tries).toBe(1)
  })

  it('says the same for a declined card', () => {
    render(<Failed payment={paypalFailed()} onRetry={() => {}} />)
    expect(screen.getByText('The card was declined. Nothing was charged.')).toBeTruthy()
  })
})
