// @vitest-environment jsdom
/* Method Match and the safety check, in the checkout: the best method comes first and is chosen, and a payment the check
   holds or stops shows the right screen. The check never says why. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, courses, paymentOf, succeededPayment } from '../../../../test/buyerData.js'

vi.mock('@/api/checkout.js', () => ({
  startSession: vi.fn(),
  changeSessionCountry: vi.fn(),
  createPayment: vi.fn(),
  getPayment: vi.fn(),
  getMethodMatch: vi.fn(),
  settleSimulated: vi.fn(),
}))
vi.mock('@/api/paypal.js', () => ({
  getPaypalStatus: vi.fn(async () => ({ available: false })),
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

const api = await import('@/api/checkout.js')
const { listCourses } = await import('@/api/learners.js')
const { emitSignal } = await import('@/realtime/bus.js')
const { useCatalog } = await import('@/stores/catalog.js')
const { useLearner } = await import('@/stores/learner.js')
const { useSession } = await import('@/stores/session.js')
const { timing } = await import('./simulation.js')
const { default: Checkout } = await import('./Checkout.jsx')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }

/* What Method Match answers for a country: the best first. */
const matched = (country, ids, over = {}) => ({
  country,
  days: 30,
  basis: 'Based on how payments with each method ended in the last 30 days. Demo data.',
  methods: ids.map((id, index) => ({
    id,
    label: id,
    status: 'operational',
    successRate: 0.95 - index * 0.1,
    sample: 80,
    confidence: 'high',
    reason: index === 0 ? '96% of payments here succeed (77 of 80).' : 'Another reason.',
    rank: index + 1,
    best: index === 0,
    ...over,
  })),
})

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
  timing.waitMs = 0
  useCatalog.setState({ status: 'ready', error: null, merchant, products: courses, countries })
  useLearner.setState({ courses: [], loaded: true })
  useSession.setState({ merchant: 'pdl', buyer: null })
  api.getMethodMatch.mockReset().mockResolvedValue(matched('CI', ['voucher', 'mobile_money', 'card', 'paypal']))
  api.startSession.mockResolvedValue({ id: 'session-1' })
  api.changeSessionCountry.mockResolvedValue({})
  api.createPayment.mockResolvedValue({ payment: paymentOf() })
  api.getPayment.mockReset()
  api.settleSimulated.mockResolvedValue({ payment: succeededPayment() })
  listCourses.mockResolvedValue({ courses: [] })
})

const show = () => render(<Checkout param="ai-for-work" />)
const group = () => screen.getByRole('radiogroup', { name: 'Payment method' })
const rows = () => within(group()).getAllByRole('radio')
const payButton = () => screen.getByRole('button', { name: /^Pay / })
/* The methods on screen, top to bottom, each named by its label. */
const LABELS = ['Mobile money', 'Cash voucher', 'Card', 'PayPal', 'USSD', 'Bank transfer']
const order = () => rows().map((row) => LABELS.find((label) => row.textContent.startsWith(label)))

describe('Method Match in the checkout', () => {
  it('asks for the country the buyer is paying from', async () => {
    show()
    await waitFor(() => expect(api.getMethodMatch).toHaveBeenCalledWith('CI'))
  })

  it('puts the method most likely to succeed first, and chooses it', async () => {
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Cash voucher/))
    expect(order()).toEqual(['Cash voucher', 'Mobile money', 'Card', 'PayPal'])
    expect(rows()[0].getAttribute('aria-checked')).toBe('true')
    expect(rows()[1].getAttribute('aria-checked')).toBe('false')
    expect(payButton().textContent).toBe('Pay XOF 23,400')
  })

  it('says it is the best match, and why, from real counts', async () => {
    show()
    await waitFor(() => expect(within(rows()[0]).getByText('Best match')).toBeTruthy())
    expect(within(rows()[0]).getByText('96% of payments here succeed (77 of 80).')).toBeTruthy()
    expect(within(rows()[1]).queryByText('Best match')).toBeNull()
    expect(screen.getByText('Best match first')).toBeTruthy()
  })

  it('says what Method Match is, and that it uses demo data', async () => {
    show()
    expect(
      await screen.findByText(/Method Match puts the method most likely to succeed in your country first/),
    ).toBeTruthy()
    expect(screen.getByText(/Demo data\./)).toBeTruthy()
  })

  it('does not mark a method that cannot be used as the best match', async () => {
    api.getMethodMatch.mockResolvedValue(matched('CI', ['card', 'voucher', 'mobile_money', 'paypal']))
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Card/))
    /* Card is not connected here, so the first method that can be used carries the label and is chosen */
    expect(within(rows()[0]).queryByText('Best match')).toBeNull()
    expect(within(rows()[1]).getByText('Best match')).toBeTruthy()
    expect(rows()[1].getAttribute('aria-checked')).toBe('true')
    expect(rows()[0].getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps a method the buyer picked, even when it is not the best', async () => {
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Cash voucher/))
    fireEvent.click(rows()[1])
    expect(rows()[1].getAttribute('aria-checked')).toBe('true')
    expect(rows()[0].getAttribute('aria-checked')).toBe('false')
    /* the best is still labeled */
    expect(within(rows()[0]).getByText('Best match')).toBeTruthy()
  })

  it('starts from the best match again in another country', async () => {
    api.getMethodMatch.mockImplementation(async (country) =>
      country === 'NG'
        ? matched('NG', ['ussd', 'bank_transfer', 'mobile_money', 'card', 'paypal'])
        : matched('CI', ['voucher', 'mobile_money', 'card', 'paypal']),
    )
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Cash voucher/))
    fireEvent.click(rows()[1])
    fireEvent.change(screen.getByLabelText('Where are you paying from?'), { target: { value: 'NG' } })
    await waitFor(() => expect(api.getMethodMatch).toHaveBeenCalledWith('NG'))
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^USSD/))
    expect(rows()[0].getAttribute('aria-checked')).toBe('true')
    expect(payButton().textContent).toBe('Pay NGN 58,500.00')
  })

  it('sends the best match when the buyer pays without choosing', async () => {
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Cash voucher/))
    await waitFor(() => expect(api.startSession).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.click(payButton())
    expect(await screen.findByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(api.createPayment).toHaveBeenCalledWith(expect.objectContaining({ method: 'voucher' }))
  })

  it('leaves the usual order and groups when Method Match cannot be had', async () => {
    api.getMethodMatch.mockRejectedValue(new Error('unavailable'))
    show()
    await act(async () => {})
    expect(order()).toEqual(['Mobile money', 'Cash voucher', 'Card', 'PayPal'])
    expect(screen.getByText('Pay locally')).toBeTruthy()
    expect(screen.queryByText('Best match')).toBeNull()
    expect(screen.queryByText('Best match first')).toBeNull()
  })

  it('puts a method Method Match does not know after the ones it does', async () => {
    api.getMethodMatch.mockResolvedValue(matched('CI', ['card', 'mobile_money']))
    show()
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^Card/))
    expect(order()).toEqual(['Card', 'Mobile money', 'Cash voucher', 'PayPal'])
  })

  it('ignores an answer for a country the buyer already left', async () => {
    let finishCi
    api.getMethodMatch.mockImplementation((country) =>
      country === 'CI'
        ? new Promise(
            (resolve) => (finishCi = () => resolve(matched('CI', ['voucher', 'mobile_money', 'card', 'paypal']))),
          )
        : Promise.resolve(matched('NG', ['ussd', 'bank_transfer', 'mobile_money', 'card', 'paypal'])),
    )
    show()
    fireEvent.change(screen.getByLabelText('Where are you paying from?'), { target: { value: 'NG' } })
    await waitFor(() => expect(rows()[0].textContent).toMatch(/^USSD/))
    await act(async () => finishCi())
    expect(rows()[0].textContent).toMatch(/^USSD/)
  })
})

describe('Checkout: the safety check', () => {
  const held = (over = {}) => paymentOf({ status: 'in_review', ...over })

  async function pay() {
    show()
    await waitFor(() => expect(api.startSession).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.click(payButton())
  }

  it('says the payment is being checked, that nothing was charged, and what the reference is', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    await pay()
    expect(await screen.findByRole('heading', { name: 'We are checking your payment' })).toBeTruthy()
    expect(screen.getByText(/Nothing has been charged/)).toBeTruthy()
    expect(screen.getByText('pb_AB12CD34EF56')).toBeTruthy()
    expect(api.settleSimulated).not.toHaveBeenCalled()
  })

  it('moves on by itself when a person clears it, and goes on with the same payment', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    api.getPayment.mockResolvedValue({ payment: held({ status: 'in_review' }) })
    await pay()
    await screen.findByRole('heading', { name: 'We are checking your payment' })

    api.getPayment.mockResolvedValue({ payment: paymentOf({ status: 'processing' }) })
    act(() => emitSignal({ table: 'payments', op: 'UPDATE', id: 'pay-1', status: 'processing' }))
    expect(await screen.findByRole('heading', { name: 'The check is done' })).toBeTruthy()
    expect(screen.getByText('You can finish paying now. Nothing has been charged yet.')).toBeTruthy()

    const key = api.createPayment.mock.calls[0][0].idempotencyKey
    api.createPayment.mockResolvedValue({ payment: paymentOf({ status: 'processing' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to pay' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Pay / }))
    expect(await screen.findByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(api.createPayment.mock.calls[1][0].idempotencyKey).toBe(key)
  })

  it('shows the stop screen when a person rejects it, with the same plain words', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    api.getPayment.mockResolvedValue({ payment: held() })
    await pay()
    await screen.findByRole('heading', { name: 'We are checking your payment' })

    api.getPayment.mockResolvedValue({
      payment: paymentOf({
        status: 'blocked',
        failureCode: 'safety_check',
        failureMessage: 'A safety check stopped this payment.',
      }),
    })
    act(() => emitSignal({ table: 'payments', op: 'UPDATE', id: 'pay-1', status: 'blocked' }))
    expect(await screen.findByRole('heading', { name: 'Payment not completed' })).toBeTruthy()
    expect(screen.getByText('A safety check stopped this payment. Nothing was charged.')).toBeTruthy()
  })

  it('looks again by itself if no live signal comes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.createPayment.mockResolvedValue({ payment: held() })
      api.getPayment.mockResolvedValue({ payment: held() })
      await pay()
      await screen.findByRole('heading', { name: 'We are checking your payment' })

      api.getPayment.mockResolvedValue({ payment: paymentOf({ status: 'processing' }) })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100)
      })
      expect(await screen.findByRole('heading', { name: 'The check is done' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a signal about another payment', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    api.getPayment.mockResolvedValue({ payment: held() })
    await pay()
    await screen.findByRole('heading', { name: 'We are checking your payment' })
    act(() => emitSignal({ table: 'payments', op: 'UPDATE', id: 'someone-else', status: 'processing' }))
    await act(async () => {})
    expect(api.getPayment).not.toHaveBeenCalled()
  })

  it('stops at once when the check blocks the payment', async () => {
    api.createPayment.mockResolvedValue({
      payment: paymentOf({
        status: 'blocked',
        failureCode: 'safety_check',
        failureMessage: 'A safety check stopped this payment.',
      }),
    })
    await pay()
    expect(await screen.findByRole('heading', { name: 'Payment not completed' })).toBeTruthy()
    expect(screen.getByText('A safety check stopped this payment. Nothing was charged.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull()
    expect(api.settleSimulated).not.toHaveBeenCalled()
  })

  it('starts the next attempt as a new request after a block', async () => {
    api.createPayment.mockResolvedValue({
      payment: paymentOf({ status: 'blocked', failureMessage: 'A safety check stopped this payment.' }),
    })
    await pay()
    await screen.findByRole('heading', { name: 'Payment not completed' })
    const first = api.createPayment.mock.calls[0][0].idempotencyKey

    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
    cleanupAndShowAgain()
    api.createPayment.mockResolvedValue({ payment: paymentOf() })
    await waitFor(() => expect(api.startSession).toHaveBeenCalledTimes(2))
    await act(async () => {})
    fireEvent.click(payButton())
    await screen.findByRole('heading', { name: "You're in" })
    expect(api.createPayment.mock.calls[1][0].idempotencyKey).not.toBe(first)
  })

  it('goes back to the courses from the waiting screen', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    api.getPayment.mockResolvedValue({ payment: held() })
    await pay()
    fireEvent.click(await screen.findByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('never shows a score, a rule or a reason', async () => {
    api.createPayment.mockResolvedValue({ payment: held() })
    await pay()
    await screen.findByRole('heading', { name: 'We are checking your payment' })
    expect(document.body.textContent).not.toMatch(/score|signal|risk|throwaway|fraud|rule/i)
  })
})

/* The page is shown again from scratch, as a buyer coming back to the course would. */
function cleanupAndShowAgain() {
  document.body.innerHTML = ''
  show()
}
