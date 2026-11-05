// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/demo.js', () => ({ getDemoState: vi.fn(), runScenario: vi.fn(), resetDemo: vi.fn() }))
vi.mock('@/lib/reload.js', () => ({ reloadApp: vi.fn() }))

const api = await import('@/api/demo.js')
const { reloadApp } = await import('@/lib/reload.js')
const { useNav } = await import('@/stores/nav.js')
const { useSession } = await import('@/stores/session.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: DemoNotice } = await import('./DemoNotice.jsx')
const { default: DemoPanel } = await import('./DemoPanel.jsx')

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

const scenario = (id, title, over = {}) => ({
  id,
  title,
  blurb: `What ${title} does.`,
  watch: [{ tab: 'admin', section: 'review', label: 'Admin: Risk review' }],
  available: true,
  reason: null,
  ...over,
})

const demoState = (over = {}) => ({
  enabled: true,
  made: 3,
  waiting: 1,
  ai: true,
  scenarios: [
    scenario('sale', 'A sale'),
    scenario('attack', 'Card testing attack'),
    scenario('recovery', 'The outage ends', { available: false, reason: 'Nothing is down.' }),
  ],
  ...over,
})

const outcome = (over = {}) => ({
  id: 'attack',
  title: 'Card testing attack',
  headline: 'A bot made 4 attempts. The last one was blocked at once.',
  steps: [
    { text: 'Attempt 1: held for review (score 40).', tone: 'warn' },
    { text: 'Attempt 4: blocked at once (score 60).', tone: 'bad' },
    { text: 'The buyer, the seller and the admin were told.', tone: 'ok' },
  ],
  watch: [
    { tab: 'admin', section: 'review', label: 'Admin: Risk review' },
    { tab: 'admin', section: 'overview', label: 'Admin: Overview' },
  ],
  seconds: 9.4,
  ...over,
})

const messages = () => useToasts.getState().items.map((item) => item.message)
const show = async (onClose = vi.fn()) => {
  render(<DemoPanel onClose={onClose} />)
  await screen.findByText('Run a scenario')
  return onClose
}

beforeEach(() => {
  window.location.hash = ''
  window.localStorage.clear()
  useToasts.setState({ items: [] })
  useNav.setState({ view: 'app', tab: 'buyer', section: 'home' })
  useSession.setState({ merchant: 'pdl', buyer: { id: 'b-1', name: 'Aminata', email: 'a@example.com' } })
  api.getDemoState.mockReset().mockResolvedValue(demoState())
  api.runScenario.mockReset().mockResolvedValue(outcome())
  api.resetDemo.mockReset().mockResolvedValue({ payments: 1300 })
  reloadApp.mockReset()
})

describe('Demo panel: scenarios', () => {
  it('lists the scenarios with what each does, and says why one cannot run', async () => {
    await show()
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('A sale')).toBeTruthy()
    expect(within(list).getByText('What Card testing attack does.')).toBeTruthy()
    expect(within(list).getByText('Nothing is down.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run The outage ends' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Run A sale' }).disabled).toBe(false)
  })

  it('says each scenario goes through the real pipeline', async () => {
    await show()
    expect(
      screen.getByText(/Each one goes through the real checkout, the real risk rules and the real notifications/),
    ).toBeTruthy()
  })

  it('runs one, shows it working, then what really happened and how long it took', async () => {
    let finish
    api.runScenario.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Run Card testing attack' }))
    await waitFor(() => expect(api.runScenario).toHaveBeenCalledWith('attack'))
    expect(await screen.findByText('This one can take up to 15 seconds.')).toBeTruthy()
    /* nothing else can start while one runs */
    expect(screen.getByRole('button', { name: 'Run A sale' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Reset the demo' }).disabled).toBe(true)

    finish(outcome())
    const result = await screen.findByRole('status', { name: 'Result: Card testing attack' })
    expect(within(result).getByText('A bot made 4 attempts. The last one was blocked at once.')).toBeTruthy()
    expect(
      within(result)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Attempt 1: held for review (score 40).',
      'Attempt 4: blocked at once (score 60).',
      'The buyer, the seller and the admin were told.',
    ])
    expect(within(result).getByText('Took 9.4 s.')).toBeTruthy()
    expect(screen.queryByText('This one can take up to 15 seconds.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Run A sale' }).disabled).toBe(false)
  })

  it('looks again at what can run once a scenario is done', async () => {
    await show()
    expect(api.getDemoState).toHaveBeenCalledTimes(1)
    api.getDemoState.mockResolvedValue(
      demoState({ scenarios: [scenario('sale', 'A sale'), scenario('recovery', 'The outage ends')] }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run A sale' }))
    await waitFor(() => expect(api.getDemoState).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run The outage ends' }).disabled).toBe(false))
  })

  it('takes the person to where it can be watched, and closes the panel', async () => {
    const onClose = await show()
    fireEvent.click(screen.getByRole('button', { name: 'Run Card testing attack' }))
    const result = await screen.findByRole('status', { name: 'Result: Card testing attack' })
    fireEvent.click(within(result).getByRole('button', { name: 'Admin: Overview' }))
    expect(window.location.hash).toBe('#/admin/overview')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the reason and keeps the panel when a scenario cannot run', async () => {
    api.runScenario.mockRejectedValue(
      new Error('The review queue already has 12 payments. Decide them first, or reset the demo.'),
    )
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Run Card testing attack' }))
    await waitFor(() =>
      expect(messages()).toContain('The review queue already has 12 payments. Decide them first, or reset the demo.'),
    )
    expect(screen.queryByRole('status', { name: /Result/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Run A sale' }).disabled).toBe(false)
  })

  it('clears the last result when another scenario starts', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Run Card testing attack' }))
    await screen.findByRole('status', { name: 'Result: Card testing attack' })
    let finish
    api.runScenario.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    fireEvent.click(screen.getByRole('button', { name: 'Run A sale' }))
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Result: Card testing attack' })).toBeNull())
    finish(outcome({ title: 'A sale', headline: 'Aminata K. paid $39.00.', steps: [] }))
    expect(await screen.findByRole('status', { name: 'Result: A sale' })).toBeTruthy()
  })
})

describe('Demo panel: when the tools are off', () => {
  it('shows nothing when the server has them off', async () => {
    api.getDemoState.mockResolvedValue({ enabled: false, made: 0, waiting: 0, scenarios: [] })
    const { container } = render(<DemoPanel onClose={vi.fn()} />)
    await waitFor(() => expect(api.getDemoState).toHaveBeenCalled())
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('shows nothing, and no error, when the server cannot be reached', async () => {
    api.getDemoState.mockRejectedValue(new Error('We could not reach the server.'))
    const { container } = render(<DemoPanel onClose={vi.fn()} />)
    await waitFor(() => expect(container.textContent).toBe(''))
    expect(messages()).toEqual([])
  })
})

describe('Demo panel: reset', () => {
  const open = async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Reset the demo' }))
    return screen.findByRole('dialog', { name: 'Reset the demo?' })
  }

  it('says how much was made, and what a reset does', async () => {
    await show()
    expect(screen.getByText(/3 payments made so far, 1 waiting for review/)).toBeTruthy()
    expect(screen.getByText(/A reset erases what was made and writes fresh demo history up to today/)).toBeTruthy()
  })

  it('says so when nothing was made', async () => {
    api.getDemoState.mockResolvedValue(demoState({ made: 0, waiting: 0 }))
    await show()
    expect(screen.getByText(/Nothing has been made since the last reset/)).toBeTruthy()
  })

  it('says there is no data yet on a new deployment, and a reset is the way to write it', async () => {
    api.getDemoState.mockResolvedValue(
      demoState({
        empty: true,
        made: 0,
        waiting: 0,
        scenarios: [
          scenario('sale', 'A sale', {
            available: false,
            reason: 'The demo has no data yet. Reset the demo to write it.',
          }),
        ],
      }),
    )
    await show()
    expect(
      screen.getByText(/The demo has no data yet. A reset writes it: ninety days of history up to today./),
    ).toBeTruthy()
    expect(screen.getByText('The demo has no data yet. Reset the demo to write it.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run A sale' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Reset the demo' }).disabled).toBe(false)
  })

  it('asks first, and says what it erases and that it cannot be undone', async () => {
    const dialog = await open()
    expect(
      within(dialog).getByText(/erases every payment, buyer, payment link, notification and change made in the demo/),
    ).toBeTruthy()
    expect(within(dialog).getByText(/It cannot be undone/)).toBeTruthy()
    expect(api.resetDemo).not.toHaveBeenCalled()
  })

  it('does nothing when cancelled', async () => {
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Reset the demo?' })).toBeNull()
    expect(api.resetDemo).not.toHaveBeenCalled()
  })

  it('resets, forgets the buyer of this browser, and loads the app again', async () => {
    window.localStorage.setItem('pb.buyer', JSON.stringify({ id: 'b-1' }))
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(api.resetDemo).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(messages()).toContain('The demo was reset. Loading the fresh data.'))
    expect(useSession.getState().buyer).toBeNull()
    expect(window.localStorage.getItem('pb.buyer')).toBeNull()
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })

  it('shows why a reset failed, closes the question and does not load again', async () => {
    api.resetDemo.mockRejectedValue(new Error('The demo was reset a moment ago. Try again in a minute.'))
    const dialog = await open()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(messages()).toContain('The demo was reset a moment ago. Try again in a minute.'))
    expect(screen.queryByRole('dialog', { name: 'Reset the demo?' })).toBeNull()
    expect(reloadApp).not.toHaveBeenCalled()
    expect(useSession.getState().buyer).not.toBeNull()
  })
})

describe('Demo pill', () => {
  it('opens the director and the honest list of what is real and what is simulated', async () => {
    render(<DemoNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    const dialog = await screen.findByRole('dialog', { name: 'About this demo' })
    expect(await within(dialog).findByText('Run a scenario')).toBeTruthy()
    expect(within(dialog).getByText('Real')).toBeTruthy()
    expect(within(dialog).getByText('Simulated')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows only the honest list when the tools are off', async () => {
    api.getDemoState.mockResolvedValue({ enabled: false, made: 0, waiting: 0, scenarios: [] })
    render(<DemoNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    const dialog = await screen.findByRole('dialog', { name: 'About this demo' })
    await waitFor(() => expect(api.getDemoState).toHaveBeenCalled())
    expect(within(dialog).queryByText('Run a scenario')).toBeNull()
    expect(within(dialog).getByText('Real')).toBeTruthy()
  })

  it('never uses a long dash', async () => {
    render(<DemoNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    await screen.findByText('Run a scenario')
    expect(document.body.textContent).not.toMatch(LONG_DASH)
  })
})
