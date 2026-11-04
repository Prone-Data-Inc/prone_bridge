import { describe, expect, it } from 'vitest'
import { columnPath, monotonePath, niceScale } from './geometry.js'

describe('niceScale', () => {
  it('gives clean ticks that reach the data', () => {
    expect(niceScale(87)).toEqual({ max: 150, ticks: [0, 50, 100, 150] })
    expect(niceScale(1200)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] })
    expect(niceScale(10)).toEqual({ max: 15, ticks: [0, 5, 10, 15] })
  })

  it('still draws an axis for no data, zeros or nonsense', () => {
    for (const value of [0, -5, NaN, Infinity, undefined, -Infinity]) {
      const { max, ticks } = niceScale(value)
      expect(Number.isFinite(max)).toBe(true)
      expect(max).toBeGreaterThan(0)
      expect(ticks.every(Number.isFinite)).toBe(true)
    }
  })

  it('always covers the largest value', () => {
    for (const value of [1, 3, 7, 99, 123, 4999, 12345]) expect(niceScale(value).max).toBeGreaterThanOrEqual(value)
  })
})

describe('monotonePath', () => {
  it('needs two points', () => {
    expect(monotonePath([])).toBe('')
    expect(monotonePath([[0, 0]])).toBe('')
    expect(
      monotonePath([
        [0, 0],
        [10, 10],
      ]).startsWith('M0,0C'),
    ).toBe(true)
  })

  it('never overshoots: a curve through a peak stays between its neighbours vertically', () => {
    const path = monotonePath([
      [0, 100],
      [10, 20],
      [20, 20],
      [30, 100],
    ])
    const ys = [...path.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map((match) => Number(match[2]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
  })
})

describe('columnPath', () => {
  it('draws a closed shape with a rounded top', () => {
    const d = columnPath(10, 20, 16, 100)
    expect(d.startsWith('M10,100')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('A4,4')
  })

  it('shrinks the radius for a very short column', () => {
    expect(columnPath(0, 98, 16, 100)).toContain('A2,2')
  })
})
