// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { countries, paymentOf } from '../../../../test/buyerData.js'
import Waiting from './Waiting.jsx'

const [ivory, nigeria] = countries

const waiting = (place, methodId, over = {}) =>
  render(
    <Waiting
      place={place}
      phone={`${place.dialCode} 07 00 00 00 00`}
      payment={paymentOf({
        method: { id: methodId, label: methodId },
        displayCurrency: place.currency,
        displayAmountMinor: place.code === 'NG' ? 5_850_000 : 23_400,
        ...over,
      })}
    />,
  )

describe('Waiting', () => {
  it('asks a mobile money buyer to approve on their phone', () => {
    waiting(ivory, 'mobile_money')
    expect(screen.getByRole('heading', { name: 'Check your phone' })).toBeTruthy()
    expect(screen.getByText('We sent a request to +225 07 00 00 00 00. Approve it to pay XOF 23,400.')).toBeTruthy()
  })

  it('gives a cash voucher code for an agent', () => {
    waiting(ivory, 'voucher')
    expect(screen.getByRole('heading', { name: 'Pay at an agent' })).toBeTruthy()
    expect(screen.getByText('Show this code and pay XOF 23,400 in cash.')).toBeTruthy()
    expect(screen.getByText('VC-AB12-CD34')).toBeTruthy()
  })

  it('gives a code to dial for USSD', () => {
    waiting(nigeria, 'ussd')
    expect(screen.getByRole('heading', { name: 'Dial this code' })).toBeTruthy()
    expect(screen.getByText(/^\*384\*\d{4}#$/)).toBeTruthy()
    expect(screen.getByText(/NGN 58,500\.00/)).toBeTruthy()
  })

  it('gives made-up bank details for a bank transfer, with the payment reference', () => {
    waiting(nigeria, 'bank_transfer')
    expect(screen.getByRole('heading', { name: 'Pay from your bank' })).toBeTruthy()
    const details = screen.getByText('Account name').closest('dl')
    expect(within(details).getByText('ProneBridge Collections')).toBeTruthy()
    expect(within(details).getByText('0000 0000 00')).toBeTruthy()
    expect(within(details).getByText('pb_AB12CD34EF56')).toBeTruthy()
  })

  it('always says it is a simulation', () => {
    waiting(ivory, 'mobile_money')
    expect(screen.getByText('Waiting for the answer. This is a simulation, no money moves.')).toBeTruthy()
  })

  it('tells assistive technology it is busy, politely', () => {
    waiting(ivory, 'mobile_money')
    const region = screen.getByRole('heading', { name: 'Check your phone' }).closest('section')
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })
})
