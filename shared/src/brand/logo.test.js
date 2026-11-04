import { describe, expect, it } from 'vitest'
import { MARK, MARK_PATH, WORDMARK, horizontalLockup } from './logo.js'
import { PALETTE } from './palette.js'

describe('logo', () => {
  it('draws the mark as four closed shapes', () => {
    expect(MARK_PATH.match(/Z/g)).toHaveLength(4)
  })

  it('has the name as path data', () => {
    expect(WORDMARK.d.length).toBeGreaterThan(1000)
    expect(WORDMARK.width).toBeGreaterThan(0)
    expect(WORDMARK.baseline).toBeGreaterThan(WORDMARK.capTop)
  })

  it('places the name to the right of the mark, centred on it', () => {
    const lockup = horizontalLockup()
    expect(lockup.height).toBe(MARK.height)
    expect(lockup.name.x).toBeGreaterThan(MARK.width)
    expect(lockup.width).toBeGreaterThan(lockup.name.x + WORDMARK.width - 1)
    expect(lockup.name.y + WORDMARK.capTop + lockup.capHeight / 2).toBeCloseTo(MARK.height / 2, 0)
  })
})

describe('palette', () => {
  it('holds valid hex colors', () => {
    for (const color of Object.values(PALETTE)) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})
