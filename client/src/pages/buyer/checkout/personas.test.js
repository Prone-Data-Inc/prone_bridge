// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { browserSuffix, demoBuyerFor, freshSuffix, personaFor, rotateBrowserSuffix } from './personas.js'

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

describe("each browser's own demo buyer", () => {
  beforeEach(() => window.localStorage.clear())

  it('is a suffix of four digits, made once and kept in this browser', () => {
    const first = browserSuffix()
    expect(first).toMatch(/^[1-9]\d{3}$/)
    expect(browserSuffix()).toBe(first)
    expect(window.localStorage.getItem('pb.persona')).toBe(first)
  })

  it('gives the same person in every country the same suffix, so two browsers never share a buyer', () => {
    window.localStorage.setItem('pb.persona', '4821')
    expect(demoBuyerFor('CI')).toEqual({ name: 'Aminata Koné', email: 'aminata.kone4821@example.com' })
    expect(demoBuyerFor('NG').email).toBe('chidi.okafor4821@example.com')
  })

  it('becomes a different person when asked', () => {
    window.localStorage.setItem('pb.persona', '4821')
    const next = rotateBrowserSuffix()
    expect(next).toMatch(/^[1-9]\d{3}$/)
    expect(browserSuffix()).toBe(next)
    expect(demoBuyerFor('CI').email).toBe(`aminata.kone${next}@example.com`)
  })

  it('replaces a stored value that is not a suffix', () => {
    window.localStorage.setItem('pb.persona', 'not-a-number')
    expect(browserSuffix()).toMatch(/^[1-9]\d{3}$/)
  })
})
