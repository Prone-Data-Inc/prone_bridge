// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakePaypal, removeFakePaypal } from '../../test/fakePaypal.js'

vi.mock('@/api/paypal.js', () => ({ getClientToken: vi.fn() }))

const { getClientToken } = await import('@/api/paypal.js')
const { SDK_URL, loadPaypal, paypalInstance, resetPaypalSdk } = await import('./paypalSdk.js')

const tags = () => [...document.head.querySelectorAll(`script[src="${SDK_URL}"]`)]

beforeEach(() => {
  resetPaypalSdk()
  removeFakePaypal()
  tags().forEach((tag) => tag.remove())
  getClientToken.mockResolvedValue({ clientToken: 'token-1', expiresIn: 900 })
})
afterEach(() => {
  vi.useRealTimers()
  removeFakePaypal()
})

describe('loadPaypal', () => {
  it('loads the v6 SDK from the PayPal sandbox, once', async () => {
    const first = loadPaypal()
    const second = loadPaypal()
    expect(tags()).toHaveLength(1)
    expect(tags()[0].src).toBe('https://www.sandbox.paypal.com/web-sdk/v6/core')
    expect(tags()[0].async).toBe(true)

    installFakePaypal()
    tags()[0].onload()
    expect(await first).toBe(window.paypal)
    expect(await second).toBe(window.paypal)
  })

  it('does not load it again when it is already there', async () => {
    installFakePaypal()
    expect(await loadPaypal()).toBe(window.paypal)
    expect(tags()).toHaveLength(0)
  })

  it('says so when PayPal cannot be loaded, and lets a later try start again', async () => {
    const failed = loadPaypal()
    tags()[0].onerror()
    await expect(failed).rejects.toThrow('We could not load PayPal.')
    expect(tags()).toHaveLength(0)

    const retry = loadPaypal()
    expect(tags()).toHaveLength(1)
    installFakePaypal()
    tags()[0].onload()
    await expect(retry).resolves.toBe(window.paypal)
  })

  it('says so when the script loaded but did not start', async () => {
    const failed = loadPaypal()
    tags()[0].onload()
    await expect(failed).rejects.toThrow('PayPal did not start.')
  })
})

describe('paypalInstance', () => {
  it('makes an instance with a fresh client token and one component', async () => {
    const fake = installFakePaypal()
    expect(await paypalInstance('card-fields')).toBe(fake.sdk)
    expect(fake.components).toEqual([{ clientToken: 'token-1', components: ['card-fields'] }])
  })

  it('keeps an instance per component, and reuses it', async () => {
    const fake = installFakePaypal()
    await paypalInstance('card-fields')
    await paypalInstance('card-fields')
    await paypalInstance('paypal-payments')
    expect(getClientToken).toHaveBeenCalledTimes(2)
    expect(fake.components.map((entry) => entry.components[0])).toEqual(['card-fields', 'paypal-payments'])
  })

  it('makes a new one when the token is getting old', async () => {
    vi.useFakeTimers()
    installFakePaypal()
    await paypalInstance('card-fields')
    vi.advanceTimersByTime(9 * 60_000)
    await paypalInstance('card-fields')
    expect(getClientToken).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2 * 60_000)
    await paypalInstance('card-fields')
    expect(getClientToken).toHaveBeenCalledTimes(2)
  })

  it('forgets a failure, so the next ask tries again', async () => {
    installFakePaypal()
    getClientToken.mockRejectedValueOnce(new Error('offline'))
    await expect(paypalInstance('paypal-payments')).rejects.toThrow('offline')
    await expect(paypalInstance('paypal-payments')).resolves.toBeTruthy()
  })
})
