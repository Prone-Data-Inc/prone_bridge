// @vitest-environment jsdom
/* The PayPal side of the checkout: the PayPal button and the card fields, with PayPal's SDK replaced by a stand-in (see
   client/test/fakePaypal.js). The test plays PayPal's part: it approves, cancels or fails, and checks what the checkout
   does with it. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, courses, paypalFailed, paypalPaymentOf, paypalSucceeded } from '../../../../test/buyerData.js'
import { installFakePaypal, removeFakePaypal } from '../../../../test/fakePaypal.js'

vi.mock('@/api/checkout.js', () => ({
  startSession: vi.fn(),
  changeSessionCountry: vi.fn(),
  createPayment: vi.fn(),
  getPayment: vi.fn(),
  settleSimulated: vi.fn(),
}))
vi.mock('@/api/paypal.js', () => ({
  getPaypalStatus: vi.fn(),
  getClientToken: vi.fn(),
  capturePayment: vi.fn(),
  cancelPayment: vi.fn(),
}))
vi.mock('@/api/learners.js', () => ({ listCourses: vi.fn() }))
vi.mock('@/api/notifications.js', () => ({
  listNotifications: vi.fn(async () => ({ items: [] })),
  getNotificationSummary: vi.fn(async () => ({ buyer: 0, seller: 0, admin: 0 })),
  markNotificationsRead: vi.fn(async () => ({ marked: 0 })),
}))

const checkoutApi = await import('@/api/checkout.js')
const paypalApi = await import('@/api/paypal.js')
const { listCourses } = await import('@/api/learners.js')
const { ApiError } = await import('@/api/client.js')
const { resetPaypalSdk } = await import('@/lib/paypalSdk.js')
const { useCatalog } = await import('@/stores/catalog.js')
const { useLearner } = await import('@/stores/learner.js')
const { usePaypal } = await import('@/stores/paypal.js')
const { useSession } = await import('@/stores/session.js')
const { timing } = await import('./simulation.js')
const { default: Checkout } = await import('./Checkout.jsx')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }
let paypal

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
  timing.waitMs = 0
  resetPaypalSdk()
  paypal = installFakePaypal()
  useCatalog.setState({ status: 'ready', error: null, merchant, products: courses, countries })
  useLearner.setState({ courses: [], loaded: true })
  useSession.setState({ merchant: 'pdl', buyer: null })
  usePaypal.setState({ status: 'idle', available: false })

  paypalApi.getPaypalStatus.mockResolvedValue({ available: true, environment: 'sandbox' })
  paypalApi.getClientToken.mockResolvedValue({ clientToken: 'browser-token', expiresIn: 900 })
  paypalApi.capturePayment.mockResolvedValue({ payment: paypalSucceeded() })
  paypalApi.cancelPayment.mockResolvedValue({ payment: paypalFailed({ failureCode: 'payer_cancelled' }) })
  checkoutApi.startSession.mockResolvedValue({ id: 'session-1' })
  checkoutApi.changeSessionCountry.mockResolvedValue({})
  checkoutApi.createPayment.mockResolvedValue({ payment: paypalPaymentOf(), paypal: { orderId: 'ORDER1' } })
  listCourses.mockResolvedValue({ courses: [] })
})

const show = () => render(<Checkout param="ai-for-work" />)
const row = (name) => screen.getByRole('radio', { name })

/* Shows the checkout and picks a method once PayPal has said it is connected. */
async function choose(name) {
  show()
  await waitFor(() => expect(row(name).getAttribute('aria-disabled')).toBeNull())
  fireEvent.click(row(name))
}

const payPalButton = () => document.querySelector('paypal-button')
const cardPay = () => screen.getByRole('button', { name: /^Pay USD/ })

async function openPaypal() {
  await choose(/^PayPal/)
  await waitFor(() => expect(payPalButton()).toBeTruthy())
}

async function openCard() {
  await choose(/^Card/)
  await waitFor(() => expect(cardPay().disabled).toBe(false))
}

/* PayPal's window: the buyer pressed the button, and PayPal asked for the order. */
async function pressPaypal() {
  fireEvent.click(payPalButton())
  await waitFor(() => expect(paypal.paypalSession.start).toHaveBeenCalled())
}

const approve = (orderId = 'ORDER1') => act(async () => paypal.callbacks.onApprove({ orderId }))
const youAreIn = () => screen.findByRole('heading', { name: "You're in" })

describe('when PayPal is connected', () => {
  it('lets card and PayPal be chosen, as sandbox methods, and charges in US dollars', async () => {
    show()
    await waitFor(() => expect(row(/^Card/).getAttribute('aria-disabled')).toBeNull())
    expect(row(/^Card/).textContent).toBe('CardVisa and MastercardSandbox')
    expect(row(/^PayPal/).textContent).toBe('PayPalPay with your PayPal accountSandbox')

    fireEvent.click(row(/^PayPal/))
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(within(summary).getByText('USD 39.00')).toBeTruthy()
    expect(
      within(summary).getByText('Charged in US dollars. PayPal does not take West African CFA franc.'),
    ).toBeTruthy()
    expect(screen.getByText('You pay in West African CFA franc (XOF).')).toBeTruthy()
  })

  it('goes back to the local price when a local method is chosen again', async () => {
    await openPaypal()
    fireEvent.click(row(/^Mobile money/))
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(within(summary).getByText('XOF 23,400')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pay XOF 23,400' })).toBeTruthy()
    expect(payPalButton()).toBeNull()
  })

  it('offers a sandbox demo control that can approve or decline, but not time out', async () => {
    await openPaypal()
    const control = screen.getByRole('radiogroup', { name: 'Test outcome' })
    expect(
      within(control)
        .getAllByRole('radio')
        .map((option) => option.textContent),
    ).toEqual(['Approve', 'Decline'])
    expect(screen.getByText('This payment runs in the PayPal sandbox. Choose how it ends.')).toBeTruthy()
  })

  it('starts the demo control from approving when the method changes', async () => {
    await openPaypal()
    fireEvent.click(screen.getByRole('radio', { name: 'Decline' }))
    fireEvent.click(row(/^Card/))
    expect(screen.getByRole('radio', { name: 'Approve' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('the PayPal button', () => {
  it('is drawn by PayPal from a fresh client token, and replaces the Pay button', async () => {
    await openPaypal()
    expect(paypal.components).toEqual([{ clientToken: 'browser-token', components: ['paypal-payments'] }])
    expect(paypal.sdk.findEligibleMethods).toHaveBeenCalled()
    expect(paypal.sdk.createPayPalOneTimePaymentSession).toHaveBeenCalledWith({
      onApprove: expect.any(Function),
      onCancel: expect.any(Function),
      onError: expect.any(Function),
    })
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
    expect(screen.getByText('PayPal sandbox payment. No money moves.')).toBeTruthy()
  })

  it('makes the order when pressed, lets PayPal open its window, then takes the money on approval', async () => {
    await openPaypal()
    await pressPaypal()

    expect(checkoutApi.createPayment).toHaveBeenCalledWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      product: 'ai-for-work',
      country: 'CI',
      method: 'paypal',
      sessionId: expect.any(String),
      buyer: { name: 'Aminata Koné', email: 'aminata.kone@example.com' },
    })
    const [options, order] = paypal.paypalSession.start.mock.calls[0]
    expect(options).toEqual({ presentationMode: 'auto' })
    await expect(order).resolves.toEqual({ orderId: 'ORDER1' })
    /* nothing is taken until the buyer approves */
    expect(paypalApi.capturePayment).not.toHaveBeenCalled()

    paypalApi.capturePayment.mockResolvedValue({
      payment: paypalSucceeded({ method: { id: 'paypal', label: 'PayPal' } }),
    })
    await approve()
    expect(await youAreIn()).toBeTruthy()
    expect(paypalApi.capturePayment).toHaveBeenCalledWith('pay-1', 'ORDER1', 'approve')

    const receipt = screen.getByText('Reference').closest('dl')
    expect(within(receipt).getByText('USD 39.00')).toBeTruthy()
    expect(within(receipt).getByText('Visa ending 1881 (PayPal sandbox)')).toBeTruthy()
    expect(within(receipt).queryByText('Course price')).toBeNull()
    expect(useSession.getState().buyer).toMatchObject({ id: 'buyer-1', email: 'aminata.kone@example.com' })
    await waitFor(() => expect(listCourses).toHaveBeenCalledWith('buyer-1'))
  })

  it('names the method on the receipt when a PayPal account paid', async () => {
    await openPaypal()
    await pressPaypal()
    paypalApi.capturePayment.mockResolvedValue({
      payment: paypalSucceeded({ method: { id: 'paypal', label: 'PayPal' }, card: null }),
    })
    await approve()
    await youAreIn()
    expect(screen.getByText('PayPal (PayPal sandbox)')).toBeTruthy()
  })

  it('does nothing, and says why, while the name or the email is not right', async () => {
    await openPaypal()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } })
    fireEvent.click(payPalButton())
    expect(await screen.findByText('Enter your name and a valid email first.')).toBeTruthy()
    expect(checkoutApi.createPayment).not.toHaveBeenCalled()
    expect(paypal.paypalSession.start).not.toHaveBeenCalled()
  })

  it('ends quietly when the buyer closes the PayPal window, and the next try is a new request', async () => {
    await openPaypal()
    await pressPaypal()
    await act(async () => paypal.callbacks.onCancel())

    expect(paypalApi.cancelPayment).toHaveBeenCalledWith('pay-1')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Payment did not go through' })).toBeNull()
    expect(payPalButton()).toBeTruthy()

    await pressPaypal()
    const [first, second] = checkoutApi.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(second).not.toBe(first)
  })

  it('shows a refusal once, and starts the next attempt fresh', async () => {
    checkoutApi.createPayment.mockRejectedValueOnce(
      new ApiError(503, 'unavailable', 'We could not reach PayPal. Try again in a moment.'),
    )
    paypal.paypalSession.start.mockImplementationOnce(async (_options, order) => (await order).orderId)
    await openPaypal()
    fireEvent.click(payPalButton())

    expect(await screen.findByText('We could not reach PayPal. Try again in a moment.')).toBeTruthy()
    await waitFor(() => expect(paypal.paypalSession.start).toHaveBeenCalled())
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    await pressPaypal()
    const [first, second] = checkoutApi.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(second).not.toBe(first)
  })

  it('says something plain when PayPal itself reports an error', async () => {
    await openPaypal()
    await act(async () => paypal.callbacks.onError(new Error('INSTRUMENT_DECLINED')))
    expect(screen.getByRole('alert').textContent).toContain('PayPal could not complete that. Try again.')
    expect(screen.getByRole('alert').textContent).not.toContain('INSTRUMENT_DECLINED')
  })

  it('asks the sandbox to refuse the payment when the demo control says decline', async () => {
    await openPaypal()
    fireEvent.click(screen.getByRole('radio', { name: 'Decline' }))
    await pressPaypal()
    paypalApi.capturePayment.mockResolvedValue({
      payment: paypalFailed({
        method: { id: 'paypal', label: 'PayPal' },
        failureCode: 'paypal_declined',
        failureMessage: 'PayPal could not take that payment.',
      }),
    })
    await approve()
    expect(await screen.findByRole('heading', { name: 'Payment did not go through' })).toBeTruthy()
    expect(paypalApi.capturePayment).toHaveBeenCalledWith('pay-1', 'ORDER1', 'decline')
    expect(screen.getByText('PayPal could not take that payment. Nothing was charged.')).toBeTruthy()
  })

  it('keeps the order when taking the money could not be confirmed, so it can be asked again without charging twice', async () => {
    await openPaypal()
    await pressPaypal()
    paypalApi.capturePayment.mockRejectedValueOnce(
      new ApiError(503, 'unavailable', 'We could not reach PayPal. Try again in a moment.'),
    )
    await approve()

    expect(await screen.findByText('We could not reach PayPal. Try again in a moment.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm the payment again' }))
    expect(await youAreIn()).toBeTruthy()
    expect(paypalApi.capturePayment).toHaveBeenCalledTimes(2)
    expect(paypalApi.capturePayment.mock.calls.map((call) => call[1])).toEqual(['ORDER1', 'ORDER1'])
    expect(checkoutApi.createPayment).toHaveBeenCalledTimes(1)
  })

  it('says so when PayPal is still confirming', async () => {
    await openPaypal()
    await pressPaypal()
    paypalApi.capturePayment.mockResolvedValue({ payment: paypalPaymentOf({ status: 'processing' }) })
    await approve()
    expect(await screen.findByRole('heading', { name: 'Payment pending' })).toBeTruthy()
    expect(
      screen.getByText('PayPal is still confirming your payment. We will tell you as soon as it goes through.'),
    ).toBeTruthy()
  })

  it('shows what happens while the payment is confirmed', async () => {
    await openPaypal()
    await pressPaypal()
    let release
    paypalApi.capturePayment.mockReturnValue(new Promise((resolve) => (release = resolve)))
    const approved = paypal.callbacks.onApprove({ orderId: 'ORDER1' })
    expect(await screen.findByRole('heading', { name: 'Confirming your payment' })).toBeTruthy()
    release({ payment: paypalSucceeded() })
    await approved
    expect(await youAreIn()).toBeTruthy()
  })

  it('ignores an approval for an order it did not make', async () => {
    await openPaypal()
    await pressPaypal()
    await approve('SOMEONEELSE')
    expect(paypalApi.capturePayment).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: "You're in" })).toBeNull()
  })

  it('says so when PayPal is not available on this device', async () => {
    paypal.eligible.paypal = false
    await choose(/^PayPal/)
    expect(await screen.findByText('PayPal is not available here. Choose another method.')).toBeTruthy()
    expect(payPalButton()).toBeNull()
  })

  it('says so when PayPal cannot be loaded', async () => {
    paypalApi.getClientToken.mockRejectedValue(new Error('offline'))
    await choose(/^PayPal/)
    expect(await screen.findByText('We could not load PayPal. Reload the page to try again.')).toBeTruthy()
  })

  it('does not leave the button behind when another method is chosen', async () => {
    await openPaypal()
    fireEvent.click(row(/^Cash voucher/))
    expect(payPalButton()).toBeNull()
  })
})

describe('the card fields', () => {
  it("draws PayPal's three inputs, and a Pay button in US dollars", async () => {
    await openCard()
    expect(paypal.components).toEqual([{ clientToken: 'browser-token', components: ['card-fields'] }])
    const types = paypal.cardSession.createCardFieldsComponent.mock.calls.map(([options]) => [
      options.type,
      options.placeholder,
    ])
    expect(types).toEqual([
      ['number', 'Card number'],
      ['expiry', 'MM/YY'],
      ['cvv', 'CVV'],
    ])
    for (const label of ['Card number', 'Expiry', 'Security code']) {
      expect(screen.getByText(label).nextElementSibling.querySelector('[data-type]')).toBeTruthy()
    }
    expect(cardPay().textContent).toBe('Pay USD 39.00')
    expect(
      screen.getByText(
        'Sandbox: use the test card 4012 8888 8888 1881, any future date and any 3 digits. No money moves.',
      ),
    ).toBeTruthy()
  })

  it('gives the inputs a readable style, since PayPal draws them white in both themes', async () => {
    await openCard()
    const [{ style }] = paypal.cardSession.createCardFieldsComponent.mock.calls[0]
    expect(style).toMatchObject({ color: '#0b1b3f', fontSize: '16px' })
  })

  it('is off until the fields are ready, and while the name or email is not right', async () => {
    await openCard()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } })
    expect(cardPay().disabled).toBe(true)
  })

  it('makes the order when Pay is pressed, has PayPal check the card, then takes the money', async () => {
    await openCard()
    fireEvent.click(cardPay())
    expect(await youAreIn()).toBeTruthy()

    expect(checkoutApi.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'card', product: 'ai-for-work' }),
    )
    expect(paypal.cardSession.submit).toHaveBeenCalledWith('ORDER1', {})
    expect(paypalApi.capturePayment).toHaveBeenCalledWith('pay-1', 'ORDER1', 'approve')
    const receipt = screen.getByText('Reference').closest('dl')
    expect(within(receipt).getByText('Visa ending 1881 (PayPal sandbox)')).toBeTruthy()
    expect(within(receipt).getByText('USD 39.00')).toBeTruthy()
  })

  it('takes nothing when the card check fails, and says what to do', async () => {
    paypal.submitAnswer = { state: 'failed', data: {} }
    await openCard()
    fireEvent.click(cardPay())
    expect(await screen.findByText('The card could not be checked. Check the details and try again.')).toBeTruthy()
    expect(paypalApi.capturePayment).not.toHaveBeenCalled()
    expect(paypalApi.cancelPayment).not.toHaveBeenCalled()
  })

  it('tries again on the same order when the card is corrected', async () => {
    paypal.submitAnswer = { state: 'failed', data: {} }
    await openCard()
    fireEvent.click(cardPay())
    await screen.findByRole('alert')

    paypal.submitAnswer = { state: 'succeeded', data: {} }
    await waitFor(() => expect(cardPay().disabled).toBe(false))
    fireEvent.click(cardPay())
    expect(await youAreIn()).toBeTruthy()
    const keys = checkoutApi.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(new Set(keys).size).toBe(1)
  })

  it('points to the sandbox account when a card is refused and PayPal had said cards are not on', async () => {
    paypal.eligible.advanced_cards = false
    paypal.submitAnswer = { state: 'failed', data: {} }
    await openCard()
    fireEvent.click(cardPay())
    expect(await screen.findByText(/may not be switched on for this PayPal sandbox account/)).toBeTruthy()
  })

  it('draws the fields even when PayPal says cards are not eligible, since that answer is not reliable', async () => {
    paypal.eligible.advanced_cards = false
    await openCard()
    expect(paypal.cardSession.createCardFieldsComponent).toHaveBeenCalledTimes(3)
  })

  it('goes back to the form, with nothing said, when the buyer closes the 3D Secure window', async () => {
    paypal.submitAnswer = { state: 'canceled', data: {} }
    await openCard()
    fireEvent.click(cardPay())
    await waitFor(() => expect(paypalApi.cancelPayment).toHaveBeenCalledWith('pay-1'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Payment did not go through' })).toBeNull()
  })

  it('shows a declined card with its reason, and Try again brings the fields back', async () => {
    paypalApi.capturePayment.mockResolvedValue({ payment: paypalFailed() })
    await openCard()
    fireEvent.click(cardPay())
    expect(await screen.findByRole('heading', { name: 'Payment did not go through' })).toBeTruthy()
    expect(screen.getByText('The card was declined. Nothing was charged.')).toBeTruthy()

    paypal.cardSession.createCardFieldsComponent.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardPay().disabled).toBe(false))
    expect(paypal.cardSession.createCardFieldsComponent).toHaveBeenCalledTimes(3)
  })

  it('asks the sandbox to refuse the card when the demo control says decline', async () => {
    await openCard()
    fireEvent.click(screen.getByRole('radio', { name: 'Decline' }))
    fireEvent.click(cardPay())
    await waitFor(() => expect(paypalApi.capturePayment).toHaveBeenCalledWith('pay-1', 'ORDER1', 'decline'))
  })

  it('says so, and offers another try, when the fields cannot be loaded', async () => {
    paypal.sdk.findEligibleMethods.mockRejectedValueOnce(new Error('offline'))
    await choose(/^Card/)
    expect(await screen.findByText(/We could not load the card fields/)).toBeTruthy()
    expect(cardPay().disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(cardPay().disabled).toBe(false))
  })

  it('removes the fields when another method is chosen', async () => {
    await openCard()
    fireEvent.click(row(/^Mobile money/))
    expect(screen.queryByText('Card number')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pay XOF 23,400' })).toBeTruthy()
  })
})

describe('when PayPal is not connected', () => {
  it('keeps card and PayPal off, as coming soon', async () => {
    paypalApi.getPaypalStatus.mockResolvedValue({ available: false })
    show()
    await waitFor(() => expect(paypalApi.getPaypalStatus).toHaveBeenCalled())
    expect(row(/^Card/).getAttribute('aria-disabled')).toBe('true')
    expect(row(/^Card/).textContent).toBe('CardVisa and MastercardSoon')
    fireEvent.click(row(/^PayPal/))
    expect(row(/^Mobile money/).getAttribute('aria-checked')).toBe('true')
    expect(window.paypal.createInstance).not.toHaveBeenCalled()
    removeFakePaypal()
  })
})
