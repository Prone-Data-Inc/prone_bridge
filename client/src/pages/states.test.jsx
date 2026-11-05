// @vitest-environment jsdom
/* The error states of the whole app, at once. Every page is opened while the API fails, in two ways (the network is down,
   the server answers with an error), and has to say so in words and offer a way to try again. A page that crashes, or
   sits on its loading skeleton for ever, fails here. */
import { render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../../test/fakeGrid.jsx')).default }))

const { PAGES } = await import('./index.js')
const { default: ErrorBoundary } = await import('@/components/ErrorBoundary.jsx')
const { useCatalog } = await import('@/stores/catalog.js')
const { useCopilot } = await import('@/stores/copilot.js')
const { useLearner } = await import('@/stores/learner.js')
const { useSession } = await import('@/stores/session.js')

/* Pages that take a name after their address. */
const PARAMS = { 'buyer/course': 'ai-for-work', 'buyer/checkout': 'ai-for-work', 'buyer/link': 'k7m3q9x2' }

const FAILURES = {
  'the network is down': () => Promise.reject(new TypeError('fetch failed')),
  'the server fails': () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong. Try again.' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
}

/* Words that tell a person what happened or what to do. */
const SAYS_SOMETHING =
  /try again|could not|something went wrong|not available|no longer|not found|nothing|no .* yet|sign in|open the/i

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
  useCatalog.setState({ status: 'idle', error: null, merchant: null, products: [], countries: [] })
  useLearner.setState({ courses: [], loaded: false })
  useCopilot.setState({ status: null, statusError: null, turns: [], asking: false, waiting: [] })
  useSession.setState({ merchant: 'pdl', buyer: { id: 'b-1', name: 'Aminata', email: 'a@example.com' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe.each(Object.entries(FAILURES))('when %s', (_name, fail) => {
  it.each(Object.keys(PAGES))(
    '%s says so and does not break',
    async (key) => {
      vi.stubGlobal('fetch', vi.fn(fail))
      const Page = PAGES[key]
      const { container } = render(
        <ErrorBoundary resetKey={key}>
          <Suspense fallback={<p>Loading the page</p>}>
            <Page param={PARAMS[key] ?? null} />
          </Suspense>
        </ErrorBoundary>,
      )

      /* it never crashes */
      await waitFor(() => expect(screen.queryByText('Loading the page')).toBeNull(), { timeout: 5000 })
      expect(screen.queryByText('Something broke on this page')).toBeNull()

      /* and it says what happened, in words, rather than staying empty or on a skeleton */
      await waitFor(() => expect(container.textContent).toMatch(SAYS_SOMETHING), { timeout: 5000 })
    },
    15_000,
  )
})
