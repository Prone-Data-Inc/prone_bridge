import { describe, expect, it } from 'vitest'
import { RANGES, dateTime, dayLabel, deltaOf, dollars, shortDate, usd } from './format.js'

describe('seller formatters', () => {
  it('writes cents as dollars', () => {
    expect(usd(1_212_500)).toBe('$12,125.00')
    expect(usd(3802)).toBe('$38.02')
    expect(usd(0)).toBe('$0.00')
  })

  it('writes chart dollars short: whole dollars, then thousands', () => {
    expect(dollars(412.4)).toBe('$412')
    expect(dollars(12_125)).toBe('$12,125')
    expect(dollars(99_999)).toBe('$99,999')
    expect(dollars(100_000)).toBe('$100K')
    expect(dollars(0)).toBe('$0')
  })

  it('writes a day as a short date, in UTC, whatever the time zone', () => {
    expect(dayLabel('2026-10-06')).toBe('Oct 6')
    expect(dayLabel('2026-11-04')).toBe('Nov 4')
  })

  it('writes dates with and without a time', () => {
    expect(shortDate('2026-10-30T19:01:00.000Z')).toMatch(/^Oct 3[01], 2026$/)
    expect(dateTime('2026-10-30T12:00:00.000Z')).toMatch(/^Oct 30, \d{1,2}:\d{2} (AM|PM)$/)
  })

  it('takes a change as it is, or nothing when there is nothing to compare with', () => {
    expect(deltaOf({ value: 5, previous: 4, delta: 0.25 })).toBe(0.25)
    expect(deltaOf({ value: 0, previous: 4, delta: -1 })).toBe(-1)
    expect(deltaOf({ value: 5, previous: 0, delta: null })).toBeUndefined()
  })

  it('offers 7, 30 and 90 days', () => {
    expect(RANGES.map((range) => range.value)).toEqual([7, 30, 90])
  })
})
