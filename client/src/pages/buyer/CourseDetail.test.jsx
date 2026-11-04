// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, courses } from '../../../test/buyerData.js'

vi.mock('@/api/catalog.js', () => ({ listProducts: vi.fn(), listCountries: vi.fn() }))
vi.mock('@/api/learners.js', () => ({ listCourses: vi.fn(async () => ({ courses: [] })) }))

const { useCatalog } = await import('@/stores/catalog.js')
const { useLearner } = await import('@/stores/learner.js')
const { useNav } = await import('@/stores/nav.js')
const { useSession } = await import('@/stores/session.js')
const { curriculumFor } = await import('./curriculum.js')
const { default: CourseDetail } = await import('./CourseDetail.jsx')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }
const course = courses[0]

beforeEach(() => {
  window.location.hash = ''
  useNav.setState({ view: 'app', tab: 'buyer', section: 'course' })
  useCatalog.setState({ status: 'ready', error: null, merchant, products: courses, countries, ensure: async () => {} })
  useLearner.setState({ courses: [], loaded: true })
  useSession.setState({ merchant: 'pdl', buyer: null })
})

const modules = () => within(screen.getByRole('region', { name: 'What you will learn' })).getAllByRole('listitem')
const moduleButton = (index) => within(modules()[index]).getByRole('button')

describe('CourseDetail: before buying', () => {
  it('shows the course, its price and a way to buy', () => {
    render(<CourseDetail param="ai-for-work" />)
    expect(screen.getByRole('heading', { level: 1, name: 'AI for Work' })).toBeTruthy()
    expect(screen.getByText('Put AI to use on real tasks.')).toBeTruthy()
    expect(screen.getByText('A practical course on using AI at work.')).toBeTruthy()
    const card = screen.getByRole('complementary', { name: 'Buy this course' })
    expect(within(card).getByText('$39')).toBeTruthy()
    expect(within(card).getByText('One payment. Pay in your own currency at checkout.')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Buy this course' }))
    expect(window.location.hash).toBe('#/buyer/checkout/ai-for-work')
  })

  it('lists the facts of the course', () => {
    render(<CourseDetail param="ai-for-work" />)
    const facts = screen.getByText('Lessons').closest('dl')
    expect(facts.textContent).toBe('Lessons20Time4.5 hLevelBeginner')
  })

  it('opens the first module as a free preview and locks the rest', () => {
    render(<CourseDetail param="ai-for-work" />)
    const outline = curriculumFor(course)
    expect(modules()).toHaveLength(outline.length)
    expect(moduleButton(0).disabled).toBe(false)
    expect(within(modules()[0]).getByText('Free preview')).toBeTruthy()
    for (let index = 1; index < outline.length; index += 1) {
      expect(moduleButton(index).disabled).toBe(true)
      expect(within(modules()[index]).getByLabelText('Locked')).toBeTruthy()
    }
  })

  it('says the videos are not part of the demo when a preview is opened', () => {
    render(<CourseDetail param="ai-for-work" />)
    fireEvent.click(moduleButton(0))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('This is a demo. The course videos are not part of it.')).toBeTruthy()
    /* the corner button and the footer button both close it */
    const closers = within(dialog).getAllByRole('button', { name: 'Close' })
    expect(closers).toHaveLength(2)
    fireEvent.click(closers[1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('CourseDetail: after buying', () => {
  beforeEach(() => {
    useLearner.setState({ courses: [course], loaded: true })
  })

  it('swaps the buy card for an unlocked one', () => {
    render(<CourseDetail param="ai-for-work" />)
    const card = screen.getByRole('complementary', { name: 'Buy this course' })
    expect(within(card).getByText('Unlocked')).toBeTruthy()
    expect(within(card).getByText('You own this course.')).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Buy this course' })).toBeNull()
    expect(within(card).queryByText('$39')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'My courses' }))
    expect(window.location.hash).toBe('#/buyer/learn')
  })

  it('opens every module', () => {
    render(<CourseDetail param="ai-for-work" />)
    for (let index = 0; index < modules().length; index += 1) expect(moduleButton(index).disabled).toBe(false)
    expect(screen.queryByText('Free preview')).toBeNull()
    expect(screen.queryByLabelText('Locked')).toBeNull()
  })

  it('starts the first lesson from Start learning', () => {
    render(<CourseDetail param="ai-for-work" />)
    fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(`1. ${curriculumFor(course)[0].title}`)).toBeTruthy()
    expect(within(dialog).getByText('This is a demo. The course videos are not part of it.')).toBeTruthy()
  })

  it('does not unlock a different course', () => {
    render(<CourseDetail param="sql-in-practice" />)
    expect(screen.getByRole('button', { name: 'Buy this course' })).toBeTruthy()
    expect(screen.queryByText('You own this course.')).toBeNull()
  })
})

describe('CourseDetail: the rest', () => {
  it('shows placeholders while the courses load', () => {
    useCatalog.setState({ status: 'loading', products: [] })
    render(<CourseDetail param="ai-for-work" />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('says so when the course does not exist', () => {
    render(<CourseDetail param="nothing-here" />)
    expect(screen.getByText('We could not find that course')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to courses' }))
    expect(window.location.hash).toBe('#/buyer/home')
  })

  it('says so when the courses cannot be loaded, and can try again', () => {
    const reload = vi.fn()
    useCatalog.setState({ status: 'error', error: 'We could not reach the server.', reload })
    render(<CourseDetail param="ai-for-work" />)
    expect(screen.getByText('We could not load this course')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })
})
