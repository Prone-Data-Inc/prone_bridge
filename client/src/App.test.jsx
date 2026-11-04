// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const health = (integrations) => ({
  data: {
    status: 'ok',
    service: 'pronebridge-api',
    version: '0.1.0',
    environment: 'test',
    time: '2026-11-04T10:00:00.000Z',
    integrations,
  },
})

const reply = (body, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

const row = (label) => screen.getByText(label).closest('li')

describe('App launch screen', () => {
  it('shows the brand, the tagline and the demo notice', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    render(<App />)

    expect(screen.getByRole('img', { name: 'Prone Bridge' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Get paid across Africa.' })).toBeTruthy()
    expect(screen.getByText('Demo build. Nothing here moves real money.')).toBeTruthy()
  })

  it('shows what the API reports', async () => {
    vi.stubGlobal('fetch', () =>
      reply(health({ database: 'not_configured', paypal: 'configured', ai: 'not_configured' })),
    )
    render(<App />)

    await waitFor(() => expect(within(row('Server')).getByText('Online')).toBeTruthy())
    expect(within(row('PayPal sandbox')).getByText('Configured')).toBeTruthy()
    expect(within(row('Database')).getByText('Not set up')).toBeTruthy()
    expect(within(row('AI')).getByText('Not set up')).toBeTruthy()
  })

  it('shows the server as offline, and tries again on request', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('failed'))
      .mockImplementation(() => reply(health({ database: 'configured', paypal: 'configured', ai: 'configured' })))
    vi.stubGlobal('fetch', fetch)
    render(<App />)

    await waitFor(() => expect(within(row('Server')).getByText('Offline')).toBeTruthy())
    expect(within(row('Database')).getByText('Unknown')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(within(row('Server')).getByText('Online')).toBeTruthy())
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(within(row('Database')).getByText('Configured')).toBeTruthy()
  })

  it('reads the error of the API when it answers with one', async () => {
    vi.stubGlobal('fetch', () =>
      reply({ error: { code: 'internal_error', message: 'Something went wrong. Try again.' } }, 500),
    )
    render(<App />)
    await waitFor(() => expect(within(row('Server')).getByText('Offline')).toBeTruthy())
  })
})
