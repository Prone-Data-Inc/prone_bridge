// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, courses, failedPayment, paymentOf, succeededPayment } from '../../../../test/buyerData.js'

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
const { ApiError } = await import('@/api/client.js')
const { useCatalog } = await import('@/stores/catalog.js')
const { useLearner } = await import('@/stores/learner.js')
const { useSession } = await import('@/stores/session.js')
const { timing } = await import('./simulation.js')
const { default: Checkout } = await import('./Checkout.jsx')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
  timing.waitMs = 0
  useCatalog.setState({ status: 'ready', error: null, merchant, products: courses, countries })
  useLearner.setState({ courses: [], loaded: true })
  useSession.setState({ merchant: 'pdl', buyer: null })
  /* Method Match is not what most of these tests are about: without it the methods keep their usual order. */
  api.getMethodMatch.mockRejectedValue(new Error('unavailable'))
  api.startSession.mockResolvedValue({ id: 'session-1' })
  api.changeSessionCountry.mockResolvedValue({})
  api.createPayment.mockResolvedValue({ payment: paymentOf() })
  api.settleSimulated.mockResolvedValue({ payment: succeededPayment() })
  listCourses.mockResolvedValue({ courses: [] })
})

const show = (slug = 'ai-for-work') => render(<Checkout param={slug} />)
const payButton = () => screen.getByRole('button', { name: /^Pay / })
const chooseOutcome = (name) => fireEvent.click(screen.getByRole('radio', { name }))

describe('Checkout: the form', () => {
  it("shows what is being bought, the price in the buyer's currency and a buyer to start with", () => {
    show()
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(within(summary).getByRole('heading', { name: 'AI for Work' })).toBeTruthy()
    expect(within(summary).getByText('XOF 23,400')).toBeTruthy()
    expect(within(summary).getByText('$39 USD. Indicative rate, simulated.')).toBeTruthy()
    expect(screen.getByLabelText('Full name').value).toBe('Aminata Koné')
    expect(screen.getByLabelText('Email').value).toBe('aminata.kone@example.com')
    expect(payButton().textContent).toBe('Pay XOF 23,400')
  })

  it('lists local methods first, labeled as simulated, with card and PayPal not yet available', () => {
    show()
    const group = screen.getByRole('radiogroup', { name: 'Payment method' })
    const rows = within(group).getAllByRole('radio')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Mobile moneyApprove on your phoneSimulated',
      'Cash voucherPay cash at an agentSimulated',
      'CardVisa and MastercardSoon',
      'PayPalPay with your PayPal accountSoon',
    ])
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false'])
    expect(rows[2].getAttribute('aria-disabled')).toBe('true')
    expect(rows[3].getAttribute('aria-disabled')).toBe('true')
  })

  it('does not let a method that is not connected be chosen', () => {
    show()
    fireEvent.click(screen.getByRole('radio', { name: /^Card/ }))
    expect(screen.getByRole('radio', { name: /^Mobile money/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /^Card/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('switches country: the price, the currency, the methods and the made-up buyer all follow', async () => {
    show()
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith({ product: 'ai-for-work', country: 'CI' }))
    await waitFor(() => expect(screen.getByLabelText('Where are you paying from?')))
    await Promise.resolve()

    fireEvent.change(screen.getByLabelText('Where are you paying from?'), { target: { value: 'NG' } })

    expect(screen.getAllByText('NGN 58,500.00').length).toBeGreaterThan(0)
    expect(payButton().textContent).toBe('Pay NGN 58,500.00')
    expect(screen.getByText('You pay in Nigerian naira (NGN).')).toBeTruthy()
    const rows = within(screen.getByRole('radiogroup', { name: 'Payment method' })).getAllByRole('radio')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Bank transferPay from your banking appSimulated',
      'USSDDial a code on your phoneSimulated',
      'Mobile moneyApprove on your phoneSimulated',
      'CardVisa and MastercardSoon',
      'PayPalPay with your PayPal accountSoon',
    ])
    expect(screen.getByRole('radio', { name: /^Bank transfer/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('Full name').value).toBe('Chidi Okafor')
    await waitFor(() => expect(api.changeSessionCountry).toHaveBeenCalledWith('session-1', 'NG'))
    expect(window.localStorage.getItem('pb.country')).toBe('NG')
  })

  it('keeps a buyer the person has edited when the country changes', () => {
    show()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Fatou Sow' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'fatou@example.com' } })
    fireEvent.change(screen.getByLabelText('Where are you paying from?'), { target: { value: 'NG' } })
    expect(screen.getByLabelText('Full name').value).toBe('Fatou Sow')
    expect(screen.getByLabelText('Email').value).toBe('fatou@example.com')
  })

  it('cannot pay without a name and a real looking email', () => {
    show()
    expect(payButton().disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    expect(payButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ok@example.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'A' } })
    expect(payButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Al' } })
    expect(payButton().disabled).toBe(false)
  })

  it('offers a new demo buyer on request', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Use a new demo buyer' }))
    expect(screen.getByLabelText('Full name').value).toBe('Aminata Koné')
    expect(screen.getByLabelText('Email').value).toMatch(/^aminata\.kone\d{4}@example\.com$/)
  })

  it('shows the demo control and the phone number for mobile money, labeled as a test', () => {
    show()
    expect(screen.getByLabelText('Mobile money number').value).toBe('+225 07 00 00 00 00')
    expect(screen.getByText('A test number. Nothing is charged.')).toBeTruthy()
    expect(screen.getByText('Demo control')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Approve' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Simulated payment. No money moves.')).toBeTruthy()
  })
})

describe('Checkout: paying', () => {
  it('creates the payment, has the simulated provider approve it, and unlocks the course', async () => {
    show()
    /* the visit is registered a moment after the page opens */
    await waitFor(() => expect(api.startSession).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.click(payButton())

    expect(await screen.findByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(api.createPayment).toHaveBeenCalledTimes(1)
    expect(api.createPayment).toHaveBeenCalledWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      product: 'ai-for-work',
      country: 'CI',
      method: 'mobile_money',
      sessionId: 'session-1',
      buyer: { name: 'Aminata Koné', email: 'aminata.kone@example.com' },
    })
    expect(api.settleSimulated).toHaveBeenCalledWith('pay-1', 'approve')

    expect(screen.getByText('AI for Work is unlocked. A receipt is in your notifications.')).toBeTruthy()
    const receipt = screen.getByText('Reference').closest('dl')
    expect(within(receipt).getByText('XOF 23,400')).toBeTruthy()
    expect(within(receipt).getByText('$39.00')).toBeTruthy()
    expect(within(receipt).getByText('Mobile money (simulated)')).toBeTruthy()
    expect(within(receipt).getByText('pb_AB12CD34EF56')).toBeTruthy()

    /* the buyer is remembered, and their courses are looked up again */
    expect(useSession.getState().buyer).toEqual({
      id: 'buyer-1',
      name: 'Aminata Koné',
      email: 'aminata.kone@example.com',
    })
    await waitFor(() => expect(listCourses).toHaveBeenCalledWith('buyer-1'))
  })

  it('sends what the person chose: another outcome, another method, another country', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Where are you paying from?'), { target: { value: 'NG' } })
    fireEvent.click(screen.getByRole('radio', { name: /^USSD/ }))
    chooseOutcome('Time out')
    fireEvent.click(payButton())

    await screen.findByRole('heading', { name: "You're in" })
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'NG',
        method: 'ussd',
        buyer: expect.objectContaining({ name: 'Chidi Okafor' }),
      }),
    )
    expect(api.settleSimulated).toHaveBeenCalledWith('pay-1', 'timeout')
  })

  it('shows what to do while it waits, then the answer', async () => {
    /* long enough that a busy machine still sees the waiting screen before the answer arrives */
    timing.waitMs = 400
    show()
    fireEvent.click(payButton())
    expect(await screen.findByRole('heading', { name: 'Check your phone' })).toBeTruthy()
    expect(screen.getByText('We sent a request to +225 07 00 00 00 00. Approve it to pay XOF 23,400.')).toBeTruthy()
    expect(screen.getByText('Waiting for the answer. This is a simulation, no money moves.')).toBeTruthy()
    expect(api.settleSimulated).not.toHaveBeenCalled()

    expect(await screen.findByRole('heading', { name: "You're in" }, { timeout: 5000 })).toBeTruthy()
  })

  it('says why a payment did not go through, and lets the buyer try again with a new request', async () => {
    api.settleSimulated.mockResolvedValueOnce({ payment: failedPayment() })
    show()
    chooseOutcome('Decline')
    fireEvent.click(payButton())

    expect(await screen.findByRole('heading', { name: 'Payment did not go through' })).toBeTruthy()
    expect(screen.getByText('The balance was too low. Nothing was charged.')).toBeTruthy()
    expect(screen.getByText('pb_AB12CD34EF56')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: "You're in" })).toBeNull()
    expect(api.settleSimulated).toHaveBeenCalledWith('pay-1', 'decline')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    /* back on the form with the same buyer, and the demo control ready to approve */
    expect(screen.getByLabelText('Full name').value).toBe('Aminata Koné')
    expect(screen.getByRole('radio', { name: 'Approve' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(payButton())
    expect(await screen.findByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(api.createPayment).toHaveBeenCalledTimes(2)
    const [first, second] = api.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(second).not.toBe(first)
  })

  it('does not start a second payment while the first is under way', async () => {
    timing.waitMs = 400
    show()
    fireEvent.click(payButton())
    await screen.findByRole('heading', { name: 'Check your phone' })
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
    await screen.findByRole('heading', { name: "You're in" }, { timeout: 5000 })
    expect(api.createPayment).toHaveBeenCalledTimes(1)
  })

  it('shows a refusal on the form and starts the next attempt fresh', async () => {
    api.createPayment.mockRejectedValueOnce(new ApiError(409, 'conflict', 'You already own this course.'))
    show()
    fireEvent.click(payButton())

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('You already own this course.')).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Open the course' })).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Use a new demo buyer' })).toBeTruthy()

    fireEvent.click(within(alert).getByRole('button', { name: 'Use a new demo buyer' }))
    fireEvent.click(payButton())
    await screen.findByRole('heading', { name: "You're in" })
    const [first, second] = api.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(second).not.toBe(first)
    expect(api.createPayment.mock.calls[1][0].buyer.email).toMatch(/^aminata\.kone\d{4}@example\.com$/)
  })

  it('opens the course from the refusal', async () => {
    api.createPayment.mockRejectedValueOnce(new ApiError(409, 'conflict', 'You already own this course.'))
    show()
    fireEvent.click(payButton())
    fireEvent.click(await screen.findByRole('button', { name: 'Open the course' }))
    expect(window.location.hash).toBe('#/buyer/course/ai-for-work')
  })

  it('shows which field the server did not accept', async () => {
    api.createPayment.mockRejectedValueOnce(
      new ApiError(400, 'bad_request', 'Check the request and try again.', 'r-1', {
        'buyer.email': 'Enter a valid email.',
      }),
    )
    show()
    fireEvent.click(payButton())
    expect(await screen.findByText('Enter a valid email.')).toBeTruthy()
    expect(screen.getByText('Check the request and try again.')).toBeTruthy()
  })

  it('keeps the same request when the answer never came, so a retry cannot charge twice', async () => {
    api.settleSimulated.mockRejectedValueOnce(new ApiError(0, 'network_error', 'We could not reach the server.'))
    show()
    fireEvent.click(payButton())
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()

    fireEvent.click(payButton())
    await screen.findByRole('heading', { name: "You're in" })
    const [first, second] = api.createPayment.mock.calls.map(([body]) => body.idempotencyKey)
    expect(second).toBe(first)
  })
})

describe('Checkout: owning the course', () => {
  const owner = { id: 'buyer-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' }

  beforeEach(() => {
    useSession.setState({ buyer: owner })
    useLearner.setState({ courses: [courses[0]], loaded: true })
  })

  it('has nothing to pay for a course the buyer already has', () => {
    show()
    expect(screen.getByRole('heading', { name: 'You already own this course' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open course' }))
    expect(window.location.hash).toBe('#/buyer/course/ai-for-work')
  })

  it('lets a demo buyer who does not own it buy it again', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Use a new demo buyer' }))
    expect(screen.queryByRole('heading', { name: 'You already own this course' })).toBeNull()
    expect(screen.getByLabelText('Email').value).toMatch(/^aminata\.kone\d{4}@example\.com$/)
    expect(payButton().disabled).toBe(false)
  })

  it('still sells a course the buyer does not have', () => {
    show('sql-in-practice')
    expect(screen.queryByRole('heading', { name: 'You already own this course' })).toBeNull()
    expect(payButton().textContent).toBe('Pay XOF 35,400')
  })

  it('copes with a remembered buyer that has no email', () => {
    useSession.setState({ buyer: { id: 'buyer-1', name: 'Aminata Koné' } })
    show('sql-in-practice')
    expect(screen.getByLabelText('Email').value).toBe('')
    expect(payButton().disabled).toBe(true)
  })
})

describe('Checkout: the page around it', () => {
  it('shows placeholders while the catalog loads', () => {
    useCatalog.setState({ status: 'loading', products: [], countries: [] })
    useCatalog.setState({ ensure: async () => {} })
    show()
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('says so when the course does not exist', () => {
    show('nothing-here')
    expect(screen.getByRole('heading', { name: 'We could not find that course' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('says so when the catalog cannot be loaded, and can try again', () => {
    const reload = vi.fn()
    useCatalog.setState({ status: 'error', error: 'We could not reach the server.', reload, ensure: async () => {} })
    show()
    expect(screen.getByRole('heading', { name: 'We could not load the checkout' })).toBeTruthy()
    expect(screen.getByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('starts a new checkout when the course changes', () => {
    const { rerender } = show()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Fatou Sow' } })
    rerender(<Checkout param="sql-in-practice" />)
    expect(screen.getByRole('heading', { name: 'SQL in Practice' })).toBeTruthy()
    expect(screen.getByLabelText('Full name').value).toBe('Aminata Koné')
  })
})

describe('Checkout: through a payment link', () => {
  const link = { code: '9n2pdmb6', title: 'Launch week', note: 'Thanks for joining.' }

  it('shows which link the buyer came through, and its note', () => {
    render(<Checkout param="ai-for-work" link={link} />)
    const summary = screen.getByRole('complementary', { name: 'Order summary' })
    expect(within(summary).getByText('Launch week')).toBeTruthy()
    expect(within(summary).getByText('Thanks for joining.')).toBeTruthy()
    expect(within(summary).getByRole('heading', { name: 'AI for Work' })).toBeTruthy()
  })

  it('shows the link without a note when it has none', () => {
    render(<Checkout param="ai-for-work" link={{ ...link, note: null }} />)
    expect(screen.getByText('Launch week')).toBeTruthy()
    expect(screen.queryByText('Thanks for joining.')).toBeNull()
  })

  it('tells the server about the link, on the visit and on the payment, so the seller sees where the sale came from', async () => {
    render(<Checkout param="ai-for-work" link={link} />)
    await waitFor(() =>
      expect(api.startSession).toHaveBeenCalledWith({ product: 'ai-for-work', country: 'CI', link: '9n2pdmb6' }),
    )
    await act(async () => {})
    fireEvent.click(payButton())
    expect(await screen.findByRole('heading', { name: "You're in" })).toBeTruthy()
    expect(api.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ product: 'ai-for-work', link: '9n2pdmb6' }),
    )
  })

  it('mentions no link at all when there is none', async () => {
    show()
    await waitFor(() => expect(api.startSession).toHaveBeenCalled())
    expect(api.startSession.mock.calls[0][0].link).toBeUndefined()
    fireEvent.click(payButton())
    await screen.findByRole('heading', { name: "You're in" })
    expect(api.createPayment.mock.calls[0][0].link).toBeUndefined()
  })
})
