// @vitest-environment jsdom
/* The two trust pages: the fairness proof and the audit log. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { audit, fairness, probe } from '../../../test/adminData.js'

vi.mock('@/api/admin.js', () => ({ getFairness: vi.fn(), probeFairness: vi.fn(), getAudit: vi.fn() }))
vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../../../test/fakeGrid.jsx')).default }))

const api = await import('@/api/admin.js')
const { useToasts } = await import('@/stores/toasts.js')
const { default: Fairness } = await import('./Fairness.jsx')
const { default: Audit } = await import('./Audit.jsx')

const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

beforeEach(() => {
  useToasts.setState({ items: [] })
  api.getFairness.mockResolvedValue(fairness())
  api.probeFairness.mockResolvedValue(probe())
  api.getAudit.mockResolvedValue(audit())
})

describe('Fairness', () => {
  const show = async () => {
    render(<Fairness />)
    await screen.findByRole('heading', { name: 'Country never decides risk' })
  }
  const card = (title) => screen.getByRole('heading', { name: title }).closest('section')

  it('states what the rules refuse, and how the lines are drawn', async () => {
    await show()
    expect(screen.getByText(/Where the buyer is from, their name and their language are not inputs/)).toBeTruthy()
    expect(screen.getByText(/scoring would stop with an error, and a test fails the build/)).toBeTruthy()
    expect(
      screen.getByText(
        /Engine rules-1\. Under 30 is low and goes ahead\. 30 to 59 is held for a person\. 60 and above is blocked\./,
      ),
    ).toBeTruthy()
  })

  it('lists what the rules read, straight from the server', async () => {
    await show()
    const reads = card('What the rules read')
    expect(within(reads).getByText('Throwaway email')).toBeTruthy()
    expect(within(reads).getByText('Only whether the address is from a throwaway mail service.')).toBeTruthy()
    expect(within(reads).getByText('Card and PayPal declines')).toBeTruthy()
  })

  it('lists what they never read, and what the AI note never sees', async () => {
    await show()
    const never = card('What they never read')
    for (const name of ['Country', 'Nationality', 'Ethnicity', 'Name'])
      expect(within(never).getByText(name)).toBeTruthy()
    const note = card('What the AI note sees')
    expect(within(note).getByText('The AI only words the note. It never changes a decision.')).toBeTruthy()
    expect(within(note).getByText('The names of the rules that fired')).toBeTruthy()
    for (const name of ['Buyer name', 'Email address', 'Country', 'Phone number']) {
      expect(within(note).getByText(name)).toBeTruthy()
    }
  })

  it('lists the rules, what each looks for, what it reads and its most points', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'The risk rules', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Throwaway email')).toBeTruthy()
    expect(within(rows[1]).getByText('throwawayEmail')).toBeTruthy()
    expect(within(rows[1]).getByText('up to 40')).toBeTruthy()
  })

  it('scores a real payment from every country when asked, and shows one answer', async () => {
    await show()
    const trial = card('Try it')
    fireEvent.click(within(trial).getByRole('button', { name: 'Score it from every country' }))
    await waitFor(() => expect(api.probeFairness).toHaveBeenCalledTimes(1))
    expect(await within(trial).findByText('The score is 40 (medium) in all 3 countries.')).toBeTruthy()
    expect(within(trial).getByText(/Payment/)).toBeTruthy()
    expect(within(trial).getByText('Kenya')).toBeTruthy()
    expect(within(trial).getAllByText('40').length).toBeGreaterThanOrEqual(3)
    expect(within(trial).getByRole('list', { name: 'Rules that fired' })).toBeTruthy()
    expect(within(trial).getByRole('button', { name: 'Run it again' })).toBeTruthy()
  })

  it('says loudly if the scores ever differ between countries', async () => {
    api.probeFairness.mockResolvedValue(
      probe({
        identical: false,
        results: [
          { code: 'CI', name: "Côte d'Ivoire", score: 40, level: 'medium' },
          { code: 'KE', name: 'Kenya', score: 60, level: 'high' },
        ],
      }),
    )
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Score it from every country' }))
    expect(
      await screen.findByText('The scores differ between countries. This should never happen: report it.'),
    ).toBeTruthy()
  })

  it('says so when there is no scored payment to try', async () => {
    api.probeFairness.mockResolvedValue({ payment: null, results: [], identical: true, fired: [] })
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Score it from every country' }))
    expect(await screen.findByText('There is no scored payment to try yet.')).toBeTruthy()
  })

  it('shows the reason when the trial fails', async () => {
    api.probeFairness.mockRejectedValue(new Error('We could not reach the server.'))
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Score it from every country' }))
    await waitFor(() =>
      expect(useToasts.getState().items.map((item) => item.message)).toContain('We could not reach the server.'),
    )
  })

  it('rates each country, with the share held or blocked', async () => {
    await show()
    const table = screen.getByRole('table', { name: 'Ratings by country', hidden: true })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[2]).getByText('Nigeria')).toBeTruthy()
    expect(within(rows[2]).getByText('250')).toBeTruthy()
    expect(within(rows[2]).getByText('1.9')).toBeTruthy()
    expect(within(rows[2]).getByText('2.4%')).toBeTruthy()
  })

  it('names the widest gap and says where it comes from', async () => {
    await show()
    expect(
      screen.getByText(
        "Of 716 scored payments, 1.7% were held or blocked. Among countries with at least 30 payments, the highest rate is 2.4% (Nigeria) and the lowest 1.0% (Côte d'Ivoire). Any gap comes from what buyers did, since country is not an input.",
      ),
    ).toBeTruthy()
  })

  it('says so when no two countries have enough payments to compare', async () => {
    api.getFairness.mockResolvedValue(fairness({ gap: null }))
    await show()
    expect(screen.getByText(/No two countries have enough payments to compare yet/)).toBeTruthy()
  })

  it('says so when nothing was scored', async () => {
    api.getFairness.mockResolvedValue(
      fairness({ countries: [], gap: null, summary: { assessed: 0, flagged: 0, flaggedRate: 0, compared: 0 } }),
    )
    await show()
    expect(screen.getByText('No payments were scored in this period.')).toBeTruthy()
    expect(screen.getByText('Nothing to compare yet.')).toBeTruthy()
  })

  it('asks for 30 days, then for the period chosen', async () => {
    await show()
    expect(api.getFairness).toHaveBeenLastCalledWith({ days: 30 })
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    await waitFor(() => expect(api.getFairness).toHaveBeenLastCalledWith({ days: 7 }))
  })

  it('never uses a long dash', async () => {
    await show()
    expect(document.body.textContent).not.toMatch(LONG_DASH)
  })

  it('shows an error with a way to try again', async () => {
    api.getFairness.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Fairness />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Country never decides risk' })).toBeTruthy()
  })
})

describe('Audit log', () => {
  const show = async () => {
    render(<Audit />)
    return screen.findByTestId('grid')
  }

  it('lists what happened, with who did it and what it was about', async () => {
    const grid = await show()
    expect(api.getAudit).toHaveBeenLastCalledWith({ actor: '', limit: 500 })
    expect(grid.dataset).toMatchObject({ noun: 'entries', export: 'audit-log' })
    const heads = within(grid)
      .getAllByRole('columnheader')
      .map((head) => head.textContent)
    expect(heads).toEqual(['When', 'Who', 'Name', 'What', 'On', 'Details'])
    const cells = within(within(grid).getAllByRole('row')[1])
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(cells).toEqual(expect.arrayContaining(['Admin', 'corridor.changed', 'corridor KE:mobile_money']))
  })

  it('summarises simple details in the row and keeps nested ones for the full view', async () => {
    const grid = await show()
    const second = within(grid).getAllByRole('row')[2]
    expect(within(second).getByText('kind: method, summary: Turn on Mobile money in Kenya')).toBeTruthy()
  })

  it('filters by who did it', async () => {
    await show()
    fireEvent.change(screen.getByLabelText('Who'), { target: { value: 'ai' } })
    await waitFor(() => expect(api.getAudit).toHaveBeenLastCalledWith({ actor: 'ai', limit: 500 }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    await waitFor(() => expect(api.getAudit).toHaveBeenLastCalledWith({ actor: '', limit: 500 }))
  })

  it('opens an entry in full, with its details as written', async () => {
    const grid = await show()
    fireEvent.click(within(grid).getByText('corridor.changed'))
    const dialog = await screen.findByRole('dialog', { name: 'corridor.changed' })
    expect(within(dialog).getByText('corridor KE:mobile_money')).toBeTruthy()
    expect(dialog.querySelector('pre').textContent).toContain('"status": "down"')
  })

  it('says how many entries are shown when there are more', async () => {
    api.getAudit.mockResolvedValue(audit({ total: 1200 }))
    await show()
    expect(screen.getByText('Showing the latest 2 of 1,200 entries.')).toBeTruthy()
  })

  it('says so when there is nothing to show', async () => {
    api.getAudit.mockResolvedValue(audit({ entries: [], total: 0 }))
    render(<Audit />)
    expect(await screen.findByText('Nothing here yet')).toBeTruthy()
  })

  it('shows an error with a way to try again', async () => {
    api.getAudit.mockRejectedValueOnce(new Error('We could not reach the server.'))
    render(<Audit />)
    expect(await screen.findByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('grid')).toBeTruthy()
  })
})
