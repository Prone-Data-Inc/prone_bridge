// @vitest-environment jsdom
/* A brand new installation: the tables exist, nothing is in them, as on a first deploy before anyone seeded the database.
   Every page has to open and say what is going on, and the way out has to be on screen: one click on Reset writes the demo. */
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Suspense } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../test/fakeGrid.jsx')).default }))
vi.mock('@/lib/reload.js', () => ({ reloadApp: vi.fn() }))

const { startStack, resetClient } = await import('./stack.js')
const { default: App } = await import('@/App.jsx')
const { PAGES } = await import('@/pages/index.js')
const { default: ErrorBoundary } = await import('@/components/ErrorBoundary.jsx')
const { reloadApp } = await import('@/lib/reload.js')

const SLOW = { timeout: 15_000 }
/* A whole app, an API and a database share one process here, so a busy machine can take longer than the default second. */
configure({ asyncUtilTimeout: 15_000 })
const PARAMS = { 'buyer/course': 'ai-for-work', 'buyer/checkout': 'ai-for-work', 'buyer/link': 'k7m3q9x2' }
const SAYS_SOMETHING =
  /try again|could not|something went wrong|not available|no longer|not found|nothing|no .* yet|reset|sign in|open the/i

let stack

beforeAll(async () => {
  stack = await startStack({ seed: false })
}, 120_000)
afterAll(() => stack.stop())

beforeEach(() => {
  cleanup()
  resetClient()
  reloadApp.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a new installation with an empty database', () => {
  it.each(Object.keys(PAGES))(
    '%s opens and says what is going on',
    async (key) => {
      const Page = PAGES[key]
      const { container } = render(
        <ErrorBoundary resetKey={key}>
          <Suspense fallback={<p>Loading the page</p>}>
            <Page param={PARAMS[key] ?? null} />
          </Suspense>
        </ErrorBoundary>,
      )
      await waitFor(() => expect(screen.queryByText('Loading the page')).toBeNull(), SLOW)
      expect(screen.queryByText('Something broke on this page')).toBeNull()
      await waitFor(() => expect(container.textContent).toMatch(SAYS_SOMETHING), SLOW)
    },
    30_000,
  )

  it('offers a reset in the Demo panel, and one click writes the demo', async () => {
    window.location.hash = '#/buyer/home'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Demo' }, SLOW))
    const dialog = await screen.findByRole('dialog', { name: 'About this demo' })
    expect(
      await within(dialog).findByText(/The demo has no data yet\. A reset writes it/, undefined, SLOW),
    ).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Run A sale' }).disabled).toBe(true)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset the demo' }))
    const sure = await screen.findByRole('dialog', { name: 'Reset the demo?' })
    fireEvent.click(within(sure).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(reloadApp).toHaveBeenCalled(), { timeout: 30_000 })

    expect(await stack.count('merchants')).toBe(5)
    expect(await stack.count('payments')).toBeGreaterThan(500)
    expect(await stack.count('risk_assessments')).toBe(await stack.count('payments'))
  }, 90_000)

  it('is a working demo after that', async () => {
    window.location.hash = '#/seller/home'
    render(<App />)
    expect(await screen.findByText('Checkout conversion', undefined, SLOW)).toBeTruthy()
    expect(screen.queryByText('We could not load this')).toBeNull()
  }, 60_000)
})
