// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelPayment, capturePayment, getClientToken, getPaypalStatus } from './paypal.js'

const answer = (data) => ({ ok: true, status: 200, json: async () => ({ data }) })

afterEach(() => vi.unstubAllGlobals())

const stub = (data = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => answer(data)),
  )
  return () => ({ url: fetch.mock.calls[0][0], init: fetch.mock.calls[0][1] })
}

describe('PayPal api', () => {
  it('asks whether PayPal is connected', async () => {
    const sent = stub({ available: true })
    await expect(getPaypalStatus()).resolves.toEqual({ available: true })
    expect(sent().url).toBe('/api/paypal/status')
    expect(sent().init.method).toBe('GET')
  })

  it('asks for a client token with a POST and no price', async () => {
    const sent = stub({ clientToken: 't', expiresIn: 900 })
    await expect(getClientToken()).resolves.toEqual({ clientToken: 't', expiresIn: 900 })
    expect(sent().url).toBe('/api/paypal/client-token')
    expect(sent().init.method).toBe('POST')
    expect(sent().init.body).toBe('{}')
  })

  it('captures with the order id and the demo outcome, and no amount', async () => {
    const sent = stub({ payment: { status: 'succeeded' } })
    await capturePayment('pay-1', 'ORDER1', 'decline')
    expect(sent().url).toBe('/api/checkout/payments/pay-1/capture')
    expect(JSON.parse(sent().init.body)).toEqual({ orderId: 'ORDER1', outcome: 'decline' })
  })

  it('approves unless told otherwise', async () => {
    const sent = stub({ payment: {} })
    await capturePayment('pay-1', 'ORDER1')
    expect(JSON.parse(sent().init.body).outcome).toBe('approve')
  })

  it('cancels a payment', async () => {
    const sent = stub({ payment: {} })
    await cancelPayment('pay-1')
    expect(sent().url).toBe('/api/checkout/payments/pay-1/cancel')
    expect(sent().init.method).toBe('POST')
  })
})
