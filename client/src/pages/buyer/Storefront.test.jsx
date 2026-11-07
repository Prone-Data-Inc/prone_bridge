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
const { useToasts } = await import('@/stores/toasts.js')
const { default: Storefront } = await import('./Storefront.jsx')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
  useToasts.setState({ items: [] })
  useNav.setState({ view: 'app', tab: 'buyer', section: 'home' })
  useCatalog.setState({ status: 'ready', error: null, merchant, products: courses, countries, ensure: async () => {} })
  useLearner.setState({ courses: [], loaded: true })
  useSession.setState({ merchant: 'pdl', buyer: null })
})

const cards = () => screen.getAllByRole('article')

describe('Storefront', () => {
  it('opens with a short pitch and says buyers pay in their own currency', () => {
    render(<Storefront />)
    expect(screen.getByRole('heading', { level: 1, name: 'Learn what moves work forward.' })).toBeTruthy()
    expect(screen.getByText('Pay in your own currency.')).toBeTruthy()
  })

  it('shows every course with its price and facts', () => {
    render(<Storefront />)
    expect(cards()).toHaveLength(3)
    const card = cards()[0]
    expect(within(card).getByRole('heading', { name: 'AI for Work' })).toBeTruthy()
    expect(within(card).getByText('20 lessons, 4.5 h, Beginner')).toBeTruthy()
    expect(within(card).getByText('$39')).toBeTruthy()
    expect(within(card).getByText('AI')).toBeTruthy()
  })

  it('filters by subject', () => {
    render(<Storefront />)
    fireEvent.click(screen.getByRole('radio', { name: 'Data' }))
    expect(cards().map((card) => within(card).getByRole('heading').textContent)).toEqual(['SQL in Practice'])
    fireEvent.click(screen.getByRole('radio', { name: 'Automation' }))
    expect(cards().map((card) => within(card).getByRole('heading').textContent)).toEqual(['Workflow Automation'])
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(cards()).toHaveLength(3)
  })

  it('opens the checkout when Buy is pressed', () => {
    render(<Storefront />)
    fireEvent.click(within(cards()[1]).getByRole('button', { name: 'Buy' }))
    expect(window.location.hash).toBe('#/buyer/checkout/sql-in-practice')
  })

  it('opens the course from its title', () => {
    render(<Storefront />)
    expect(within(cards()[0]).getByRole('link', { name: 'AI for Work' }).getAttribute('href')).toBe(
      '#/buyer/course/ai-for-work',
    )
  })

  it('shows a course the buyer owns as open and owned, not for sale', () => {
    useLearner.setState({ courses: [courses[0]], loaded: true })
    render(<Storefront />)
    /* owned courses come after the ones still to buy */
    const owned = cards()[2]
    expect(within(owned).getByRole('heading', { name: 'AI for Work' })).toBeTruthy()
    expect(within(owned).getByText('Owned')).toBeTruthy()
    expect(within(owned).queryByRole('button', { name: 'Buy' })).toBeNull()
    fireEvent.click(within(owned).getByRole('button', { name: 'Open course' }))
    expect(window.location.hash).toBe('#/buyer/course/ai-for-work')
    expect(within(cards()[0]).getByRole('button', { name: 'Buy' })).toBeTruthy()
    expect(within(cards()[0]).queryByText('Owned')).toBeNull()
  })

  it('puts the courses still to buy first, and keeps the catalog order inside each group', () => {
    useLearner.setState({ courses: [courses[0]], loaded: true })
    render(<Storefront />)
    const titles = () => cards().map((card) => within(card).getByRole('heading').textContent)
    expect(titles()).toEqual(['SQL in Practice', 'Workflow Automation', 'AI for Work'])
  })

  it('moves whichever course is owned to the end', () => {
    useLearner.setState({ courses: [courses[1]], loaded: true })
    render(<Storefront />)
    const titles = cards().map((card) => within(card).getByRole('heading').textContent)
    expect(titles).toEqual(['AI for Work', 'Workflow Automation', 'SQL in Practice'])
  })

  it('starts a new demo buyer when every course is owned, so there is always something to buy', async () => {
    window.localStorage.setItem('pb.persona', '4821')
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone4821@example.com' } })
    useLearner.setState({ courses, loaded: true })
    render(<Storefront />)

    expect(useSession.getState().buyer).toBeNull()
    expect(window.localStorage.getItem('pb.persona')).not.toBe('4821')
    expect(useToasts.getState().items.map((item) => item.message)).toEqual([
      'You own every course, so you are now a new demo buyer. There is always something to buy.',
    ])
  })

  it('leaves the buyer alone while there is still a course to buy', () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone4821@example.com' } })
    useLearner.setState({ courses: [courses[0], courses[1]], loaded: true })
    render(<Storefront />)
    expect(useSession.getState().buyer?.id).toBe('b-1')
    expect(useToasts.getState().items).toEqual([])
  })

  it('does not decide anything before the courses of the buyer have loaded', () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone4821@example.com' } })
    useLearner.setState({ courses, loaded: false })
    render(<Storefront />)
    expect(useSession.getState().buyer?.id).toBe('b-1')
  })

  it('shows placeholders while the courses load', () => {
    useCatalog.setState({ status: 'loading', products: [] })
    render(<Storefront />)
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByRole('list').getAttribute('aria-busy')).toBe('true')
  })

  it('says so when the courses cannot be loaded, and can try again', () => {
    const reload = vi.fn()
    useCatalog.setState({ status: 'error', error: 'We could not reach the server.', reload })
    render(<Storefront />)
    expect(screen.getByText('We could not load the courses')).toBeTruthy()
    expect(screen.getByText('We could not reach the server.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reload).toHaveBeenCalled()
  })

  it('names the seller, says it is a demo and shows the buyer once there is one', () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné', email: 'aminata.kone@example.com' } })
    useLearner.setState({ courses: [courses[0], courses[1]], loaded: true })
    render(<Storefront />)
    expect(screen.getByRole('navigation', { name: 'Prone Data Learning' })).toBeTruthy()
    expect(screen.getByLabelText('2 unlocked')).toBeTruthy()
    expect(screen.getByText(/Demo storefront/)).toBeTruthy()
  })
})
