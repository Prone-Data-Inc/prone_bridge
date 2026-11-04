import { describe, expect, it } from 'vitest'
import { feeFor, formatMinor, formatUsd, toLocalMinor } from './money.js'

const xof = { fxPerUsd: 600, minorUnits: 0, priceStep: 25 }
const ngn = { fxPerUsd: 1500, minorUnits: 2, priceStep: 5000 }

describe('toLocalMinor', () => {
  it('converts and rounds to the tidy step', () => {
    expect(toLocalMinor(3900, xof)).toBe(23_400)
    expect(toLocalMinor(3900, ngn)).toBe(5_850_000)
    expect(toLocalMinor(2900, { fxPerUsd: 8600, minorUnits: 0, priceStep: 1000 })).toBe(249_000)
  })

  it('rounds to the nearest step, not down', () => {
    expect(toLocalMinor(101, { fxPerUsd: 600, minorUnits: 0, priceStep: 25 })).toBe(600)
    expect(toLocalMinor(105, { fxPerUsd: 600, minorUnits: 0, priceStep: 25 })).toBe(625)
  })

  it('works without a step', () => {
    expect(toLocalMinor(1000, { fxPerUsd: 18, minorUnits: 2 })).toBe(18_000)
  })
})

describe('feeFor', () => {
  it('adds the percentage and the fixed part', () => {
    expect(feeFor(3900, { feeBps: 330, feeFixedCents: 30 })).toBe(159)
    expect(feeFor(1000, { feeBps: 250 })).toBe(25)
  })
})

describe('formatting', () => {
  it('formats dollars', () => {
    expect(formatUsd(3900)).toBe('$39.00')
  })

  it('formats local amounts with the currency code', () => {
    expect(formatMinor(23_400, { currency: 'XOF', minorUnits: 0 })).toBe('XOF 23,400')
    expect(formatMinor(5_850_000, { currency: 'NGN', minorUnits: 2 })).toBe('NGN 58,500.00')
  })
})
