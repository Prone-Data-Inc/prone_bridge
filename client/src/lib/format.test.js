import { describe, expect, it } from 'vitest'
import { capitalize, compact, courseFacts, formatNumber, initials, percent, timeAgo, usd } from './format.js'

describe('numbers', () => {
  it('formats with separators and compacts for axes', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(compact(1200)).toBe('1.2K')
    expect(compact(3_400_000)).toBe('3.4M')
    expect(compact(0)).toBe('0')
  })

  it('formats percentages, signed when asked', () => {
    expect(percent(0.1234)).toBe('12.3%')
    expect(percent(0.042, { signed: true })).toBe('+4.2%')
    expect(percent(-0.042, { signed: true })).toBe('-4.2%')
    expect(percent(0, { signed: true })).toBe('0.0%')
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-11-04T12:00:00Z')
  const ago = (ms) => new Date(now - ms).toISOString()

  it('speaks in short human units', () => {
    expect(timeAgo(ago(20_000), now)).toBe('just now')
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5 min ago')
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3 h ago')
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2 d ago')
  })

  it('switches to a date after a week', () => {
    expect(timeAgo(ago(10 * 86_400_000), now)).toBe('Oct 25')
  })

  it('never goes negative for a time in the future', () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe('just now')
  })
})

describe('course prices and facts', () => {
  it('writes whole dollars plainly and keeps the cents when there are some', () => {
    expect(usd(3900)).toBe('$39')
    expect(usd(0)).toBe('$0')
    expect(usd(3950)).toBe('$39.50')
    expect(usd(499)).toBe('$4.99')
  })

  it('capitalizes the first letter only', () => {
    expect(capitalize('beginner')).toBe('Beginner')
    expect(capitalize('')).toBe('')
    expect(capitalize()).toBe('')
  })

  it('sums a course up in one line', () => {
    expect(courseFacts({ lessons: 20, hours: 4.5, level: 'beginner' })).toBe('20 lessons, 4.5 h, Beginner')
    expect(courseFacts({ lessons: 14, hours: 3, level: 'intermediate' })).toBe('14 lessons, 3 h, Intermediate')
  })
})

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Aminata Diallo')).toBe('AD')
    expect(initials('Prone Data Learning')).toBe('PL')
    expect(initials('Kofi')).toBe('KO')
    expect(initials('')).toBe('?')
  })
})
