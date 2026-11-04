import { describe, expect, it } from 'vitest'
import { freshSuffix, personaFor } from './personas.js'

const COUNTRIES = ['CI', 'SN', 'CM', 'GN', 'ML', 'NG', 'GH', 'KE', 'ZA', 'MA']

describe('personaFor', () => {
  it('gives each country a made-up buyer with an address that cannot receive mail', () => {
    for (const code of COUNTRIES) {
      const { name, email } = personaFor(code)
      expect(name.split(' ').length).toBe(2)
      expect(email).toMatch(/^[a-z]+\.[a-z]+@example\.com$/)
    }
  })

  it('gives different people for different countries', () => {
    const emails = COUNTRIES.map((code) => personaFor(code).email)
    expect(new Set(emails).size).toBe(COUNTRIES.length)
  })

  it('strips accents from the address and keeps them in the name', () => {
    expect(personaFor('CI')).toEqual({ name: 'Aminata Koné', email: 'aminata.kone@example.com' })
    expect(personaFor('ML').email).toBe('awa.traore@example.com')
  })

  it('makes another buyer of the same person with a suffix', () => {
    expect(personaFor('CI', '4821')).toEqual({ name: 'Aminata Koné', email: 'aminata.kone4821@example.com' })
  })

  it('falls back to a default for an unknown country', () => {
    expect(personaFor('XX')).toEqual(personaFor('CI'))
  })
})

describe('freshSuffix', () => {
  it('is four digits', () => {
    for (let index = 0; index < 50; index += 1) expect(freshSuffix()).toMatch(/^[1-9]\d{3}$/)
  })
})
