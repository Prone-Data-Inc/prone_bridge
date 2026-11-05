import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/copilot.js', () => ({
  getCopilotStatus: vi.fn(),
  askCopilot: vi.fn(),
  confirmAction: vi.fn(),
  dismissAction: vi.fn(),
}))

const api = await import('@/api/copilot.js')
const { ApiError } = await import('@/api/client.js')
const { useToasts } = await import('./toasts.js')
const { useCopilot } = await import('./copilot.js')

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
  reply: 'You made $12,125.',
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
  api.confirmAction.mockReset().mockResolvedValue({ action: action({ status: 'confirmed', result: { ok: true } }) })
  api.dismissAction.mockReset().mockResolvedValue({ action: action({ status: 'dismissed' }) })
})

const state = () => useCopilot.getState()

describe('loading the status', () => {
  it('keeps what the server says, and the changes still waiting from an earlier visit', async () => {
    api.getCopilotStatus.mockResolvedValue(status({ pending: [action()] }))
    await state().loadStatus()
    expect(state().status.enabled).toBe(true)
    expect(state().waiting.map((item) => item.id)).toEqual(['act-1'])
  })

  it('does not list a change twice when it is already part of the conversation', async () => {
    api.askCopilot.mockResolvedValue(answer({ actions: [action()] }))
    await state().ask('Turn it on')
    api.getCopilotStatus.mockResolvedValue(status({ pending: [action()] }))
    await state().loadStatus()
    expect(state().waiting).toEqual([])
  })

  it('remembers that it could not load', async () => {
    api.getCopilotStatus.mockRejectedValue(new Error('We could not reach the server.'))
    await state().loadStatus()
    expect(state().statusError).toBe('We could not reach the server.')
    expect(state().status).toBeNull()
  })
})

describe('asking', () => {
  it('adds the question and the answer, with what the copilot looked at', async () => {
    await state().ask('  How were my sales?  ')
    const [question, reply] = state().turns
    expect(question).toMatchObject({ role: 'user', content: 'How were my sales?' })
    expect(reply).toMatchObject({
      role: 'assistant',
      content: 'You made $12,125.',
      steps: [{ tool: 'get_overview', label: 'Read your overview' }],
      error: null,
    })
    expect(state().asking).toBe(false)
  })

  it('sends the conversation so far as plain text, and nothing else', async () => {
    await state().ask('First')
    await state().ask('Second')
    expect(api.askCopilot).toHaveBeenLastCalledWith([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'You made $12,125.' },
      { role: 'user', content: 'Second' },
    ])
  })

  it('does not send the errors back as if the copilot had said them', async () => {
    api.askCopilot.mockRejectedValueOnce(new Error('The AI could not answer that. Try again.'))
    await state().ask('First')
    await state().ask('Second')
    expect(api.askCopilot).toHaveBeenLastCalledWith([
      { role: 'user', content: 'First' },
      { role: 'user', content: 'Second' },
    ])
  })

  it('sends at most the last twelve messages', async () => {
    for (let index = 0; index < 8; index += 1) await state().ask(`Question ${index}`)
    const sent = api.askCopilot.mock.calls.at(-1)[0]
    expect(sent).toHaveLength(12)
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Question 7' })
  })

  it("shows a failure as the copilot's turn, so the person sees what went wrong", async () => {
    api.askCopilot.mockRejectedValue(
      new Error('The AI has reached its limit for today. It starts again at midnight UTC.'),
    )
    await state().ask('Anything')
    expect(state().turns.at(-1)).toMatchObject({
      role: 'assistant',
      content: '',
      error: 'The AI has reached its limit for today. It starts again at midnight UTC.',
    })
    expect(state().asking).toBe(false)
  })

  it('ignores an empty question, and a second one while the first is on its way', async () => {
    await state().ask('   ')
    expect(api.askCopilot).not.toHaveBeenCalled()
    let finish
    api.askCopilot.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const first = state().ask('One')
    await state().ask('Two')
    expect(api.askCopilot).toHaveBeenCalledTimes(1)
    expect(state().asking).toBe(true)
    finish(answer())
    await first
    expect(state().turns).toHaveLength(2)
  })

  it('refreshes the budget after every answer', async () => {
    await state().ask('Hello')
    expect(api.getCopilotStatus).toHaveBeenCalled()
  })

  it('clears the conversation', async () => {
    await state().ask('Hello')
    state().reset()
    expect(state().turns).toEqual([])
    expect(state().asking).toBe(false)
  })
})

describe('deciding on a proposed change', () => {
  const withAction = async () => {
    api.askCopilot.mockResolvedValue(answer({ actions: [action()] }))
    await state().ask('Turn on mobile money in Kenya')
  }
  const proposed = () => state().turns.at(-1).actions[0]

  it('confirms it, shows it done, and says so', async () => {
    await withAction()
    const deciding = state().decide('act-1', 'confirm')
    expect(proposed().busy).toBe(true)
    await deciding
    expect(api.confirmAction).toHaveBeenCalledWith('act-1')
    expect(proposed()).toMatchObject({ status: 'confirmed', busy: false })
    expect(useToasts.getState().items.map((item) => item.message)).toContain('Done. The change is made.')
  })

  it('dismisses it without a toast', async () => {
    await withAction()
    await state().decide('act-1', 'dismiss')
    expect(api.dismissAction).toHaveBeenCalledWith('act-1')
    expect(proposed().status).toBe('dismissed')
    expect(useToasts.getState().items).toEqual([])
  })

  it('takes a change off the waiting list once it is decided', async () => {
    api.getCopilotStatus.mockResolvedValue(status({ pending: [action()] }))
    await state().loadStatus()
    expect(state().waiting).toHaveLength(1)
    api.getCopilotStatus.mockResolvedValue(status())
    await state().decide('act-1', 'confirm')
    expect(state().waiting).toEqual([])
  })

  it('marks a change as gone when it expired or was already decided', async () => {
    await withAction()
    api.confirmAction.mockRejectedValue(new ApiError(400, 'bad_request', 'That change expired. Ask the copilot again.'))
    await state().decide('act-1', 'confirm')
    expect(proposed()).toMatchObject({
      status: 'expired',
      problem: 'That change expired. Ask the copilot again.',
      busy: false,
    })
  })

  it('keeps a change pending when the server could not be reached, so it can be tried again', async () => {
    await withAction()
    api.confirmAction.mockRejectedValue(new ApiError(0, 'network_error', 'We could not reach the server.'))
    await state().decide('act-1', 'confirm')
    expect(proposed()).toMatchObject({ status: 'pending', busy: false })
    expect(useToasts.getState().items.map((item) => item.message)).toContain('We could not reach the server.')
  })
})
