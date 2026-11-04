import { describe, expect, it } from 'vitest'
import { reference, shortName } from './ids.js'

describe('reference', () => {
  it('looks like pb_ followed by twelve clear characters', () => {
    expect(reference()).toMatch(/^pb_[A-HJKMNP-TV-Z2-9]{12}$/)
    expect(reference('po', 8)).toMatch(/^po_[A-HJKMNP-TV-Z2-9]{8}$/)
  })

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 500 }, () => reference())).size).toBe(500)
  })
})

describe('shortName', () => {
  it('keeps the first name and the first letter of the last', () => {
    expect(shortName('Aminata Diallo')).toBe('Aminata D.')
    expect(shortName('Jan van der Merwe')).toBe('Jan M.')
  })

  it('copes with one name or none', () => {
    expect(shortName('Kofi')).toBe('Kofi')
    expect(shortName('')).toBe('A buyer')
    expect(shortName('  ')).toBe('A buyer')
  })
})
