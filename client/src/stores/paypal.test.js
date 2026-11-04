// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/paypal.js', () => ({ getPaypalStatus: vi.fn() }))

const { getPaypalStatus } = await import('@/api/paypal.js')
const { usePaypal } = await import('./paypal.js')

beforeEach(() => usePaypal.setState({ status: 'idle', available: false }))

describe('PayPal store', () => {
  it('starts with PayPal off, so card and PayPal show as coming', () => {
    expect(usePaypal.getState()).toMatchObject({ status: 'idle', available: false })
  })

  it('turns PayPal on when the server says it is connected', async () => {
    getPaypalStatus.mockResolvedValue({ available: true, environment: 'sandbox' })
    await usePaypal.getState().ensure()
    expect(usePaypal.getState()).toMatchObject({ status: 'ready', available: true })
  })

  it('keeps PayPal off when the server says it is not connected', async () => {
    getPaypalStatus.mockResolvedValue({ available: false })
    await usePaypal.getState().ensure()
    expect(usePaypal.getState()).toMatchObject({ status: 'ready', available: false })
  })

  it('asks once', async () => {
    getPaypalStatus.mockResolvedValue({ available: true })
    await Promise.all([usePaypal.getState().ensure(), usePaypal.getState().ensure()])
    await usePaypal.getState().ensure()
    expect(getPaypalStatus).toHaveBeenCalledTimes(1)
  })

  it('stays off, and asks again next time, when the server cannot say', async () => {
    getPaypalStatus.mockRejectedValueOnce(new Error('offline'))
    await usePaypal.getState().ensure()
    expect(usePaypal.getState()).toMatchObject({ status: 'idle', available: false })

    getPaypalStatus.mockResolvedValue({ available: true })
    await usePaypal.getState().ensure()
    expect(usePaypal.getState().available).toBe(true)
  })
})
