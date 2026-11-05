/* Method Match ranking: the method most likely to succeed comes first, and a lucky streak with few payments does not win. */
import { describe, expect, it } from 'vitest'
import { MATCH_DAYS, rankMethods } from './match.js'

const method = (id, over = {}) => ({ id, label: id, status: 'operational', sort: 10, ...over })
const counts = (entries) => new Map(Object.entries(entries))

describe('rankMethods', () => {
  it('puts the method that succeeds most often first', () => {
    const ranked = rankMethods([method('a'), method('b'), method('c')], {
      local: counts({ a: { paid: 80, finished: 100 }, b: { paid: 95, finished: 100 }, c: { paid: 60, finished: 100 } }),
      network: counts({
        a: { paid: 85, finished: 100 },
        b: { paid: 90, finished: 100 },
        c: { paid: 70, finished: 100 },
      }),
    })
    expect(ranked.map((entry) => entry.id)).toEqual(['b', 'a', 'c'])
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3])
    expect(ranked.map((entry) => entry.best)).toEqual([true, false, false])
  })

  it('does not let three lucky payments beat a long record', () => {
    const ranked = rankMethods([method('new'), method('steady')], {
      local: counts({ new: { paid: 3, finished: 3 }, steady: { paid: 92, finished: 100 } }),
      network: counts({ new: { paid: 70, finished: 100 }, steady: { paid: 90, finished: 100 } }),
    })
    expect(ranked[0].id).toBe('steady')
    expect(ranked[1].successRate).toBeLessThan(0.85)
  })

  it('leans on the network average when a method has few payments here, and says so', () => {
    const [entry] = rankMethods([method('a')], {
      local: counts({}),
      network: counts({ a: { paid: 90, finished: 100 } }),
    })
    expect(entry.successRate).toBeCloseTo(0.9, 10)
    expect(entry.sample).toBe(0)
    expect(entry.confidence).toBe('low')
    expect(entry.reason).toBe('Not many payments here yet, so this uses the ProneBridge average of 90%.')
  })

  it('uses a plain assumption for a method nobody has used anywhere', () => {
    const [entry] = rankMethods([method('a')], { local: counts({}), network: counts({}) })
    expect(entry.successRate).toBeCloseTo(0.85, 10)
  })

  it('states the real record once there are enough payments', () => {
    const [entry] = rankMethods([method('a')], {
      local: counts({ a: { paid: 93, finished: 100 } }),
      network: counts({ a: { paid: 90, finished: 100 } }),
    })
    expect(entry.reason).toBe('93% of payments here succeed (93 of 100).')
    expect(entry.confidence).toBe('high')
  })

  it('moves a slow method down, and says it is slow', () => {
    const stats = {
      local: counts({ a: { paid: 95, finished: 100 }, b: { paid: 85, finished: 100 } }),
      network: counts({}),
    }
    const ranked = rankMethods([method('a', { status: 'degraded' }), method('b')], stats)
    expect(ranked.map((entry) => entry.id)).toEqual(['b', 'a'])
    expect(ranked[1].reason).toBe('Slower than usual right now.')
  })

  it('breaks a tie by who has more payments, then by the usual order', () => {
    const stats = { local: counts({}), network: counts({}) }
    expect(rankMethods([method('late', { sort: 20 }), method('early', { sort: 10 })], stats).map((e) => e.id)).toEqual([
      'early',
      'late',
    ])
  })

  it('answers nothing for no methods', () => {
    expect(rankMethods([], { local: counts({}), network: counts({}) })).toEqual([])
  })

  it('looks back thirty days', () => {
    expect(MATCH_DAYS).toBe(30)
  })
})
