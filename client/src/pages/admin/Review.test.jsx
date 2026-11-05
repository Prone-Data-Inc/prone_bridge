// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assessment, review, signal, transactionDetail } from '../../../test/adminData.js'

vi.mock('@/api/admin.js', () => ({
  getReview: vi.fn(),
  approvePayment: vi.fn(),
  rejectPayment: vi.fn(),
  getTransaction: vi.fn(),
}))

const api = await import('@/api/admin.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Review } = await import('./Review.jsx')

beforeEach(() => {
  useToasts.setState({ items: [] })
  api.getReview.mockResolvedValue(review())
  api.approvePayment.mockResolvedValue({ payment: {} })
  api.rejectPayment.mockResolvedValue({ payment: {} })
  api.getTransaction.mockResolvedValue(transactionDetail())
})

const show = async () => {
  render(<Review />)
  return screen.findByRole('article', { name: 'Payment pb_HELD00000001' })
}
const messages = () => useToasts.getState().items.map((item) => item.message)

describe('Risk review', () => {
  it('shows a held payment with who paid, what for, and how risky the rules found it', async () => {
    const held = await show()
    expect(within(held).getByRole('heading', { name: '$39.00 for AI for Work' })).toBeTruthy()
    expect(within(held).getByText('Medium 40')).toBeTruthy()
    expect(within(held).getByText('Test Buyer')).toBeTruthy()
    expect(within(held).getByText('test.buyer@mailinator.com')).toBeTruthy()
    expect(within(held).getByText('Prone Data Learning')).toBeTruthy()
    expect(within(held).getByRole('img', { name: 'Risk score 40 out of 100, Medium' })).toBeTruthy()
  })

  it('lists the rules that fired, what each saw and the points it added', async () => {
    const held = await show()
    const rules = within(held).getByRole('list', { name: 'Rules that fired' })
    expect(within(rules).getByText('Throwaway email')).toBeTruthy()
    expect(within(rules).getByText('The email address is from a throwaway mail service.')).toBeTruthy()
    expect(within(rules).getByText('+40')).toBeTruthy()
  })

  it('says who wrote the note a reviewer reads', async () => {
    const held = await show()
    expect(within(held).getByText('The signals suggest a throwaway address was used.')).toBeTruthy()
    expect(within(held).getByText("Written by AI from the rules' findings")).toBeTruthy()
  })

  it('says when the rules wrote it themselves', async () => {
    const data = review()
    data.queue[0].assessment = {
      signals: [signal()],
      explanation: 'Held for review. A throwaway email.',
      explanationSource: 'rules',
    }
    api.getReview.mockResolvedValue(data)
    const held = await show()
    expect(within(held).getByText('Written by the rules')).toBeTruthy()
  })

  it('explains how the line between waiting and blocked is drawn, and what the AI does and does not see', async () => {
    await show()
    expect(screen.getByText(/30 to 59/)).toBeTruthy()
    expect(screen.getByText(/never sees the buyer's name, email or country/)).toBeTruthy()
  })

  it('approves with a note, tells the person it was done, and reloads', async () => {
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: /Approve/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this payment' })
    expect(within(dialog).getByText(/The buyer is told the check is done and can finish paying/)).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: '  Called the buyer  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(api.approvePayment).toHaveBeenCalledWith('pay-held', 'Called the buyer'))
    await waitFor(() => expect(messages()).toContain('Approved. The buyer can finish paying.'))
    await waitFor(() => expect(api.getReview).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog', { name: 'Approve this payment' })).toBeNull()
  })

  it('rejects, and says the buyer and the seller are told', async () => {
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject this payment' })
    expect(within(dialog).getByText(/The buyer and the seller are told, and no money moves/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(api.rejectPayment).toHaveBeenCalledWith('pay-held', undefined))
    await waitFor(() => expect(messages()).toContain('Rejected and blocked.'))
  })

  it('sends no note when none was typed', async () => {
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: /Approve/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this payment' })
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.approvePayment).toHaveBeenCalledWith('pay-held', undefined))
  })

  it('keeps the dialog open and shows the reason when the decision fails', async () => {
    api.approvePayment.mockRejectedValue(new Error('That payment was already reviewed.'))
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: /Approve/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this payment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(messages()).toContain('That payment was already reviewed.'))
    expect(screen.getByRole('dialog', { name: 'Approve this payment' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Approve' }).disabled).toBe(false)
  })

  it('cancels without deciding anything', async () => {
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject this payment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Reject this payment' })).toBeNull()
    expect(api.rejectPayment).not.toHaveBeenCalled()
  })

  it('opens the full payment from its details', async () => {
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: 'Details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_HELD00000001' })
    expect(api.getTransaction).toHaveBeenCalledWith('pay-held')
    expect(await within(dialog).findByText('Risk check')).toBeTruthy()
  })

  it('lists the recent decisions, with the note and who decided what', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Recent decisions', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByText('pb_DONE00000001')).toBeTruthy()
    expect(within(rows[1]).getByText('Approved')).toBeTruthy()
    expect(within(rows[1]).getByText('Called the buyer')).toBeTruthy()
  })

  it('says nothing is waiting when the queue is empty', async () => {
    api.getReview.mockResolvedValue(review({ queue: [], waiting: 0, recent: [] }))
    render(<Review />)
    expect(await screen.findByText('Nothing is waiting')).toBeTruthy()
    expect(screen.getByText('No payment has been reviewed yet.')).toBeTruthy()
  })

  it('shows the AI note the moment it is written, which is a moment after the payment is held', async () => {
    const { emitSignal } = await import('@/realtime/bus.js')
    const rules = review()
    rules.queue[0].assessment = {
      signals: [signal()],
      explanation: 'Held for review. A throwaway email.',
      explanationSource: 'rules',
    }
    api.getReview.mockResolvedValueOnce(rules)
    const held = await show()
    expect(within(held).getByText('Written by the rules')).toBeTruthy()

    act(() => emitSignal({ table: 'risk_assessments', op: 'UPDATE', id: 'assessment-1' }))
    await waitFor(() => expect(within(held).getByText("Written by AI from the rules' findings")).toBeTruthy(), {
      timeout: 3000,
    })
    expect(api.getReview).toHaveBeenCalledTimes(2)
  })

  it('shows an error with a way to try again', async () => {
    api.getReview.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Review />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('article', { name: 'Payment pb_HELD00000001' })).toBeTruthy()
  })

  it('shows the assessment of a payment that needs no decision without buttons to decide', async () => {
    api.getTransaction.mockResolvedValue(
      transactionDetail({
        payment: { ...transactionDetail().payment, status: 'processing' },
        assessment: assessment({ review: { decision: 'approved', note: 'Fine', at: '2026-11-04T11:00:00.000Z' } }),
      }),
    )
    const held = await show()
    fireEvent.click(within(held).getByRole('button', { name: 'Details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Payment pb_HELD00000001' })
    expect(await within(dialog).findByText('A person approved it: Fine')).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})
