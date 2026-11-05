// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courses } from '../../../test/buyerData.js'

vi.mock('@/api/learners.js', () => ({ listCourses: vi.fn(async () => ({ courses: [] })) }))

const { listCourses } = await import('@/api/learners.js')
const { useLearner } = await import('@/stores/learner.js')
const { useNav } = await import('@/stores/nav.js')
const { useSession } = await import('@/stores/session.js')
const { default: MyCourses } = await import('./MyCourses.jsx')

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'buyer', section: 'learn' })
  useLearner.setState({ courses: [], loaded: true, error: null })
  useSession.setState({ merchant: 'pdl', buyer: null })
  listCourses.mockReset().mockResolvedValue({ courses: [] })
})

describe('MyCourses', () => {
  it('shows an empty page with a way to the courses', () => {
    render(<MyCourses />)
    expect(screen.getByRole('heading', { level: 1, name: 'My courses' })).toBeTruthy()
    expect(screen.getByText('Nothing here yet')).toBeTruthy()
    expect(screen.getAllByText('Courses you buy show up here.').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Browse courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('lists the unlocked courses and says who unlocked them', () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    useLearner.setState({ courses: [courses[0], courses[1]], loaded: true })
    render(<MyCourses />)

    expect(screen.getByText('Unlocked by Aminata Koné.')).toBeTruthy()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'AI for Work' }).getAttribute('href')).toBe(
      '#/buyer/course/ai-for-work',
    )
    expect(within(rows[0]).getByText('20 lessons, 4.5 h, Beginner')).toBeTruthy()
    expect(screen.queryByText('Nothing here yet')).toBeNull()

    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Continue' }))
    expect(window.location.hash).toBe('#/buyer/course/sql-in-practice')
  })

  it('shows a placeholder until the courses are known', () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    listCourses.mockReturnValue(new Promise(() => {}))
    useLearner.setState({ courses: [], loaded: false })
    render(<MyCourses />)
    expect(screen.queryByText('Nothing here yet')).toBeNull()
    expect(screen.queryByText('We could not load your courses')).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('loads them itself when the app has not yet', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    listCourses.mockResolvedValue({ courses: [courses[0]] })
    useLearner.setState({ courses: [], loaded: false })
    render(<MyCourses />)
    expect(await screen.findByRole('link', { name: 'AI for Work' })).toBeTruthy()
    expect(listCourses).toHaveBeenCalledWith('b-1')
  })

  it('says so, and offers to try again, when they cannot be loaded', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    listCourses.mockRejectedValueOnce(new Error('We could not reach the server.'))
    useLearner.setState({ courses: [], loaded: false })
    render(<MyCourses />)
    expect(await screen.findByText('We could not load your courses')).toBeTruthy()
    expect(screen.getByText('We could not reach the server.')).toBeTruthy()
    expect(screen.queryByText('Nothing here yet')).toBeNull()

    listCourses.mockResolvedValue({ courses: [courses[0]] })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'AI for Work' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('We could not load your courses')).toBeNull())
  })

  it('keeps the courses it has when a later reload fails', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    useLearner.setState({ courses: [courses[0]], loaded: true })
    render(<MyCourses />)
    listCourses.mockRejectedValue(new Error('We could not reach the server.'))
    await useLearner.getState().load()
    expect(screen.getByRole('link', { name: 'AI for Work' })).toBeTruthy()
    expect(screen.queryByText('We could not load your courses')).toBeNull()
  })
})
