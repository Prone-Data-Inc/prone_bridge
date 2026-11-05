// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { overview } from '../../../test/adminData.js'

vi.mock('@/api/admin.js', () => ({ getOverview: vi.fn() }))

const api = await import('@/api/admin.js')
const { useNav } = await import('@/stores/nav.js')
const { default: Overview } = await import('./Overview.jsx')

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'admin', section: 'overview' })
  api.getOverview.mockResolvedValue(overview())
})

const show = async () => {
  render(<Overview />)
  await screen.findByText('Paid sales')
}
/* A label can also be the title of a card ("Volume"), so the tile is the one that sits in an article. */
const stat = (label) =>
  screen
    .getAllByText(label, { selector: 'h3' })
    .map((heading) => heading.closest('article'))
    .find(Boolean)
const card = (title) => screen.getByRole('heading', { name: title }).closest('section')

describe('Admin overview', () => {
  it('shows the network in four numbers, with how much each moved', async () => {
    await show()
    expect(within(stat('Volume')).getByText('$32,400.00')).toBeTruthy()
    expect(within(stat('Volume')).getByText('+20.0%')).toBeTruthy()
    expect(within(stat('Paid sales')).getByText('710')).toBeTruthy()
    expect(within(stat('Paid sales')).getByText('5 sellers made a sale')).toBeTruthy()
    expect(within(stat('Payments that succeed')).getByText('93.1%')).toBeTruthy()
  })

  it('moves the success rate in points, not as a share of itself', async () => {
    await show()
    /* 93.1% against 92.5% is 0.6 points up */
    expect(within(stat('Payments that succeed')).getByText('+0.6%')).toBeTruthy()
  })

  it('counts blocked payments and says how much money they kept out', async () => {
    await show()
    expect(within(stat('Blocked payments')).getByText('6')).toBeTruthy()
    expect(within(stat('Blocked payments')).getByText('$414.00 kept out')).toBeTruthy()
  })

  it('says so when nothing was blocked', async () => {
    api.getOverview.mockResolvedValue(overview({ blockedUsdCents: 0 }))
    await show()
    expect(within(stat('Blocked payments')).getByText('Nothing blocked')).toBeTruthy()
  })

  it('points to what needs a person, and goes there', async () => {
    await show()
    const list = screen.getByRole('list', { name: 'Worth a look' })
    expect(within(list).getByText('2 payments are waiting for a review.')).toBeTruthy()
    fireEvent.click(within(list).getByRole('button', { name: /Open the queue/ }))
    expect(window.location.hash).toBe('#/admin/review')
    fireEvent.click(within(list).getByRole('button', { name: /Corridors/ }))
    expect(window.location.hash).toBe('#/admin/corridors')
  })

  it('shows the review queue, how much waits in it and for how long', async () => {
    await show()
    const queue = card('Review queue')
    expect(within(queue).getByText('2')).toBeTruthy()
    expect(within(queue).getByText(/\$78\.00 waiting\. The oldest started/)).toBeTruthy()
    fireEvent.click(within(queue).getByRole('button', { name: /Open the queue/ }))
    expect(window.location.hash).toBe('#/admin/review')
  })

  it('says nothing waits when the queue is empty', async () => {
    api.getOverview.mockResolvedValue(overview({ queue: { waiting: 0, amountUsdCents: 0, oldestAt: null } }))
    await show()
    expect(within(card('Review queue')).getByText('Nothing is waiting for a person.')).toBeTruthy()
  })

  it('draws how the payments were rated', async () => {
    await show()
    const donut = screen.getByRole('group', { name: 'Payments by risk rating' })
    expect(within(donut).getByText('716')).toBeTruthy()
    expect(within(donut).getAllByText(/Low|Medium, reviewed|High, blocked/).length).toBeGreaterThanOrEqual(3)
  })

  it('says so when nothing was scored in the period', async () => {
    api.getOverview.mockResolvedValue(overview({ risk: { scored: 0, low: 0, medium: 0, high: 0 } }))
    await show()
    expect(screen.getByText('No payments were scored in this period.')).toBeTruthy()
  })

  it('lists the corridors in trouble', async () => {
    await show()
    const corridors = card('Corridors')
    expect(within(corridors).getByText('39 working')).toBeTruthy()
    expect(within(corridors).getByText('1 slow')).toBeTruthy()
    expect(within(corridors).getByText('1 down')).toBeTruthy()
    expect(within(corridors).getByText('Mobile money in Kenya')).toBeTruthy()
    expect(within(corridors).getByText('Down')).toBeTruthy()
    expect(within(corridors).getByText('USSD in Ghana')).toBeTruthy()
    expect(within(corridors).getByText('Slow')).toBeTruthy()
  })

  it('lists the latest payments the rules acted on', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Latest payments the rules acted on', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('pb_BLOCK0000001')).toBeTruthy()
    expect(within(rows[1]).getByText('High 100')).toBeTruthy()
    expect(within(rows[1]).getByText('Blocked')).toBeTruthy()
    expect(within(rows[2]).getByText('Medium 40')).toBeTruthy()
    expect(within(rows[2]).getByText('In review')).toBeTruthy()
  })

  it('says how much of the AI budget is used, or that the AI is off', async () => {
    await show()
    expect(screen.getByText('120K of 600K tokens used. It resets at midnight UTC.')).toBeTruthy()
    expect(screen.getByRole('img', { name: "20% of today's AI budget used" })).toBeTruthy()
  })

  it('says the AI is not connected, and what that means', async () => {
    api.getOverview.mockResolvedValue(overview({ ai: { enabled: false, usedTokens: 0, dailyTokenBudget: 600_000 } }))
    await show()
    expect(screen.getByText(/The AI is not connected\. Risk notes use the rules' own words/)).toBeTruthy()
  })

  it('asks for 30 days to begin with, and for another period when chosen', async () => {
    await show()
    expect(api.getOverview).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    await waitFor(() => expect(api.getOverview).toHaveBeenLastCalledWith({ days: 90 }))
  })

  it('has an empty state for a network with no payments', async () => {
    const empty = overview({ risk: { scored: 0, low: 0, medium: 0, high: 0 } })
    for (const metric of Object.values(empty.kpis)) Object.assign(metric, { value: 0, previous: 0, delta: null })
    api.getOverview.mockResolvedValue(empty)
    render(<Overview />)
    expect(await screen.findByText('No payments yet')).toBeTruthy()
  })

  it('shows an error with a way to try again', async () => {
    api.getOverview.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Overview />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Paid sales')).toBeTruthy()
  })
})
