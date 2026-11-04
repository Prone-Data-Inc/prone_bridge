// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/learners.js', () => ({ listCourses: vi.fn() }))

const { listCourses } = await import('@/api/learners.js')
const { emitSignal } = await import('@/realtime/bus.js')
const { useLearner, startLearner } = await import('./learner.js')
const { useSession } = await import('./session.js')

const aiCourse = { id: 'p-ai', slug: 'ai-for-work', title: 'AI for Work' }
const sqlCourse = { id: 'p-sql', slug: 'sql-in-practice', title: 'SQL in Practice' }

beforeEach(() => {
  useLearner.setState({ courses: [], loaded: false })
  useSession.setState({ merchant: 'pdl', buyer: null })
})

describe('learner store', () => {
  it('has no courses and is done loading when nobody has bought anything', async () => {
    await useLearner.getState().load()
    expect(listCourses).not.toHaveBeenCalled()
    expect(useLearner.getState()).toMatchObject({ courses: [], loaded: true })
  })

  it('loads the courses of the current buyer', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné' } })
    listCourses.mockResolvedValue({ courses: [aiCourse] })
    await useLearner.getState().load()
    expect(listCourses).toHaveBeenCalledWith('b-1')
    expect(useLearner.getState()).toMatchObject({ courses: [aiCourse], loaded: true })
  })

  it('knows which courses are owned', () => {
    useLearner.setState({ courses: [aiCourse], loaded: true })
    expect(useLearner.getState().owns('p-ai')).toBe(true)
    expect(useLearner.getState().owns('p-sql')).toBe(false)
  })

  it('keeps what it shows when a reload fails', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné' } })
    useLearner.setState({ courses: [aiCourse], loaded: true })
    listCourses.mockRejectedValue(new Error('offline'))
    await useLearner.getState().load()
    expect(useLearner.getState().courses).toEqual([aiCourse])
  })
})

describe('startLearner', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('loads at once and again when the buyer changes', async () => {
    listCourses.mockResolvedValue({ courses: [] })
    const stop = startLearner()
    await settle()
    expect(useLearner.getState().loaded).toBe(true)

    listCourses.mockResolvedValue({ courses: [sqlCourse] })
    useSession.setState({ buyer: { id: 'b-2', name: 'Moussa Ndiaye' } })
    await vi.waitFor(() => expect(useLearner.getState().courses).toEqual([sqlCourse]))
    expect(listCourses).toHaveBeenLastCalledWith('b-2')
    stop()
  })

  it("reloads when one of this buyer's payments succeeds, even from another window", async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné' } })
    listCourses.mockResolvedValue({ courses: [] })
    const stop = startLearner()
    await settle()

    listCourses.mockResolvedValue({ courses: [aiCourse] })
    emitSignal({ table: 'payments', op: 'UPDATE', id: 'pay-1', buyerId: 'b-1', status: 'succeeded' })
    await vi.waitFor(() => expect(useLearner.getState().courses).toEqual([aiCourse]))
    stop()
  })

  it('ignores payments of other buyers, payments that did not succeed and other tables', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné' } })
    listCourses.mockResolvedValue({ courses: [] })
    const stop = startLearner()
    await settle()
    const calls = listCourses.mock.calls.length

    emitSignal({ table: 'payments', buyerId: 'someone-else', status: 'succeeded' })
    emitSignal({ table: 'payments', buyerId: 'b-1', status: 'failed' })
    emitSignal({ table: 'notifications', buyerId: 'b-1', status: 'succeeded' })
    await settle()
    expect(listCourses.mock.calls.length).toBe(calls)
    stop()
  })

  it('stops listening when asked', async () => {
    useSession.setState({ buyer: { id: 'b-1', name: 'Aminata Koné' } })
    listCourses.mockResolvedValue({ courses: [] })
    const stop = startLearner()
    await settle()
    stop()
    const calls = listCourses.mock.calls.length

    emitSignal({ table: 'payments', buyerId: 'b-1', status: 'succeeded' })
    useSession.setState({ buyer: { id: 'b-9', name: 'Other Buyer' } })
    await settle()
    expect(listCourses.mock.calls.length).toBe(calls)
  })
})
