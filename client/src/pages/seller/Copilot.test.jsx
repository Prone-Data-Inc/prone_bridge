// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/copilot.js', () => ({
  getCopilotStatus: vi.fn(),
  askCopilot: vi.fn(),
  confirmAction: vi.fn(),
  dismissAction: vi.fn(),
}))

const api = await import('@/api/copilot.js')
const { useCopilot } = await import('@/stores/copilot.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Copilot } = await import('./Copilot.jsx')

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const action = (over = {}) => ({
  id: 'act-1',
  kind: 'method',
  summary: 'Turn on Mobile money in Kenya',
  status: 'pending',
  expiresAt: '2026-11-04T13:15:00.000Z',
  result: null,
  ...over,
})
const status = (over = {}) => ({
  enabled: true,
  dailyTokenBudget: 600_000,
  remainingTokens: 500_000,
  pending: [],
  ...over,
})
const answer = (over = {}) => ({
  reply: 'You made **$12,125** this month.\n\n- Ghana is your best country\n- Kenya lost visitors',
  steps: [{ tool: 'get_overview', label: 'Read your overview' }],
  actions: [],
  tokens: 900,
  ...over,
})

beforeEach(() => {
  useToasts.setState({ items: [] })
  useCopilot.setState({ status: null, statusError: null, turns: [], asking: false, waiting: [] })
  api.getCopilotStatus.mockReset().mockResolvedValue(status())
  api.askCopilot.mockReset().mockResolvedValue(answer())
  api.confirmAction.mockReset().mockResolvedValue({ action: action({ status: 'confirmed' }) })
  api.dismissAction.mockReset().mockResolvedValue({ action: action({ status: 'dismissed' }) })
})

const show = async () => {
  render(<Copilot />)
  return screen.findByRole('textbox', { name: 'Ask the copilot' })
}
const ask = async (question) => {
  const box = await show()
  fireEvent.change(box, { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}

describe('Copilot: before a question', () => {
  it('says what it can do, and that it is AI on demo data', async () => {
    await show()
    expect(screen.getByText(/The copilot reads your real data to answer/)).toBeTruthy()
    expect(screen.getByText(/nothing happens until you press Confirm/)).toBeTruthy()
    expect(screen.getByText('Written by AI, from demo data. Payments with local methods are simulated.')).toBeTruthy()
  })

  it('offers questions to start with, and asks one when pressed', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'How were my sales this month?' }))
    await waitFor(() =>
      expect(api.askCopilot).toHaveBeenCalledWith([{ role: 'user', content: 'How were my sales this month?' }]),
    )
  })

  it('has nothing to clear yet', async () => {
    await show()
    expect(screen.queryByRole('button', { name: 'Clear conversation' })).toBeNull()
  })
})

describe('Copilot: the conversation', () => {
  it('shows the question and the answer, with bold words and a list, and what it looked at', async () => {
    await ask('How were my sales?')
    expect(await screen.findByText('How were my sales?')).toBeTruthy()
    const bold = await screen.findByText('$12,125')
    expect(bold.tagName).toBe('STRONG')
    const list = screen.getByRole('list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Ghana is your best country', 'Kenya lost visitors'])
    expect(screen.getByLabelText('What the copilot looked at').textContent).toBe('Read your overview')
  })

  it('marks every answer as written by AI', async () => {
    await ask('Hello')
    expect(await screen.findByText('AI answer. Check important numbers on your dashboard.')).toBeTruthy()
  })

  it('clears the box, shows that it is working, and then the answer', async () => {
    let finish
    api.askCopilot.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await ask('Slow one')
    expect(screen.getByRole('textbox', { name: 'Ask the copilot' }).value).toBe('')
    expect(await screen.findByText('Reading your data')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Ask the copilot' }).disabled).toBe(true)
    finish(answer({ reply: 'Done.' }))
    expect(await screen.findByText('Done.')).toBeTruthy()
    expect(screen.queryByText('Reading your data')).toBeNull()
  })

  it('sends with Enter, and keeps Shift and Enter for a new line', async () => {
    const box = await show()
    fireEvent.change(box, { target: { value: 'With enter' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(api.askCopilot).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(api.askCopilot).toHaveBeenCalledTimes(1))
  })

  it('cannot send an empty question', async () => {
    await show()
    expect(screen.getByRole('button', { name: 'Ask' }).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask the copilot' }), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Ask' }).disabled).toBe(true)
  })

  it('limits a question to 2000 characters and counts them', async () => {
    const box = await show()
    expect(box.maxLength).toBe(2000)
    fireEvent.change(box, { target: { value: 'abc' } })
    expect(screen.getByText('3 / 2000')).toBeTruthy()
  })

  it("shows why an answer failed, as the copilot's own turn", async () => {
    api.askCopilot.mockRejectedValue(
      new Error('The AI has reached its limit for today. It starts again at midnight UTC.'),
    )
    await ask('Anything')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('The AI has reached its limit for today. It starts again at midnight UTC.')
    expect(screen.queryByText('AI answer. Check important numbers on your dashboard.')).toBeNull()
  })

  it('clears the conversation and starts over', async () => {
    await ask('Hello')
    await screen.findByText('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }))
    expect(screen.queryByText('Hello')).toBeNull()
    expect(screen.getByText(/The copilot reads your real data/)).toBeTruthy()
  })

  it('warns when almost no budget is left', async () => {
    api.getCopilotStatus.mockResolvedValue(status({ remainingTokens: 30_000 }))
    await show()
    expect(screen.getByText('The AI is almost out of budget for today.')).toBeTruthy()
  })

  it('never uses a long dash of its own', async () => {
    await show()
    expect(document.body.textContent).not.toMatch(LONG_DASH)
  })
})

describe('Copilot: a change it prepared', () => {
  const proposal = () => answer({ reply: 'That is ready to confirm.', actions: [action()] })

  it('shows what will change in words, and that nothing happens until Confirm', async () => {
    api.askCopilot.mockResolvedValue(proposal())
    await ask('Turn on mobile money in Kenya')
    expect(await screen.findByText('Turn on Mobile money in Kenya')).toBeTruthy()
    expect(screen.getByText('Prepared by the copilot')).toBeTruthy()
    expect(screen.getByText('Nothing changes until you press Confirm. It expires in 15 minutes.')).toBeTruthy()
    expect(api.confirmAction).not.toHaveBeenCalled()
  })

  it('confirms it, and then shows it done without the buttons', async () => {
    api.askCopilot.mockResolvedValue(proposal())
    await ask('Turn on mobile money in Kenya')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.confirmAction).toHaveBeenCalledWith('act-1'))
    expect(await screen.findByText('Done')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('dismisses it', async () => {
    api.askCopilot.mockResolvedValue(proposal())
    await ask('Turn on mobile money in Kenya')
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(api.dismissAction).toHaveBeenCalledWith('act-1'))
    expect(await screen.findByText('Dismissed')).toBeTruthy()
    expect(api.confirmAction).not.toHaveBeenCalled()
  })

  it('gives the link to share after making a payment link', async () => {
    api.askCopilot.mockResolvedValue(
      answer({ actions: [action({ kind: 'link_create', summary: 'Create a payment link for AI for Work' })] }),
    )
    api.confirmAction.mockResolvedValue({
      action: action({ kind: 'link_create', status: 'confirmed', result: { link: { code: 'k7m3q9x2' } } }),
    })
    await ask('Make a link')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText(/#\/buyer\/link\/k7m3q9x2$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('says a change is no longer available when it expired', async () => {
    const { ApiError } = await import('@/api/client.js')
    api.askCopilot.mockResolvedValue(proposal())
    api.confirmAction.mockRejectedValue(new ApiError(400, 'bad_request', 'That change expired. Ask the copilot again.'))
    await ask('Turn on mobile money in Kenya')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('No longer available')).toBeTruthy()
    expect(screen.getAllByText('That change expired. Ask the copilot again.').length).toBeGreaterThan(0)
  })

  it('shows changes still waiting from an earlier visit', async () => {
    api.getCopilotStatus.mockResolvedValue(status({ pending: [action()] }))
    await show()
    const waiting = await screen.findByRole('region', { name: 'Changes waiting for you' })
    expect(within(waiting).getByText('Turn on Mobile money in Kenya')).toBeTruthy()
    fireEvent.click(within(waiting).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.confirmAction).toHaveBeenCalledWith('act-1'))
  })
})

describe('Copilot: when it cannot be used', () => {
  it('says the AI is not connected, and that the rest of the dashboard works', async () => {
    api.getCopilotStatus.mockResolvedValue(status({ enabled: false }))
    render(<Copilot />)
    expect(await screen.findByText('The copilot is off')).toBeTruthy()
    expect(
      screen.getByText(/The AI is not connected yet\. Everything else in the dashboard works as usual/),
    ).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows an error with a way to try again', async () => {
    api.getCopilotStatus.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Copilot />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('textbox', { name: 'Ask the copilot' })).toBeTruthy()
  })
})
