// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleBuild } from '@/lib/staleBuild.js'

vi.mock('@/lib/reload.js', () => ({ reloadApp: vi.fn() }))

const { reloadApp } = await import('@/lib/reload.js')
const { default: ErrorBoundary } = await import('./ErrorBoundary.jsx')

let broken = true
function Fragile() {
  if (broken) throw new Error('boom')
  return <p>All good</p>
}

beforeEach(() => {
  broken = true
  reloadApp.mockReset()
  /* React logs the crash, as it should. The tests do not need to see it. */
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isStaleBuild', () => {
  it('knows what an old tab meets after a deploy', () => {
    expect(
      isStaleBuild(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Overview-1.js')),
    ).toBe(true)
    expect(isStaleBuild(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isStaleBuild(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleBuild(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true)
  })

  it('does not take an ordinary crash for one', () => {
    expect(isStaleBuild(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleBuild(null)).toBe(false)
  })
})

describe('ErrorBoundary', () => {
  it('shows what it is given while nothing is wrong', () => {
    broken = false
    render(
      <ErrorBoundary resetKey="a">
        <Fragile />
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeTruthy()
  })

  it('catches a crash, says so plainly, and keeps the rest of the page', () => {
    render(
      <div>
        <header>Tab strip</header>
        <ErrorBoundary resetKey="a">
          <Fragile />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Something broke on this page')
    expect(screen.getByText('The rest of the app still works. Try the page again, or open another one.')).toBeTruthy()
    expect(screen.getByText('Tab strip')).toBeTruthy()
    expect(console.error).toHaveBeenCalled()
  })

  it('tries the page again on request', () => {
    render(
      <ErrorBoundary resetKey="a">
        <Fragile />
      </ErrorBoundary>,
    )
    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('All good')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('starts clean on another page', () => {
    function Host() {
      const [page, setPage] = useState('a')
      return (
        <>
          <button onClick={() => setPage('b')}>Go</button>
          <ErrorBoundary resetKey={page}>{page === 'a' ? <Fragile /> : <p>Another page</p>}</ErrorBoundary>
        </>
      )
    }
    render(<Host />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByText('Another page')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers a reload, which loads the app again', () => {
    render(
      <ErrorBoundary resetKey="a">
        <Fragile />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload the app' }))
    expect(reloadApp).toHaveBeenCalledTimes(1)
  })

  it('says a new version is out when the page could not even load, and only offers the reload', () => {
    function Stale() {
      throw new TypeError('Failed to fetch dynamically imported module: https://x/assets/Overview-1.js')
    }
    render(
      <ErrorBoundary resetKey="a">
        <Stale />
      </ErrorBoundary>,
    )
    expect(screen.getByText('A new version is out')).toBeTruthy()
    expect(screen.getByText('This page was opened before an update. Reload to get the latest version.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeTruthy()
  })

  it('is the last resort for the whole app, with no "try again"', () => {
    render(
      <ErrorBoundary scope="app">
        <Fragile />
      </ErrorBoundary>,
    )
    expect(screen.getByText('ProneBridge stopped working')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeTruthy()
  })
})
