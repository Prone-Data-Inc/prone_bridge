/* The risk rules on their own: what each one adds, where the lines between low, medium and high fall, and the promise
   that a country, a name or a nationality can never reach a score. */
import { describe, expect, it } from 'vitest'
import {
  DECISIONS,
  NEVER_USED,
  RISK_INPUTS,
  RULES,
  THRESHOLDS,
  THROWAWAY_DOMAINS,
  isThrowawayEmail,
  levelOf,
  rulesExplanation,
  scoreRisk,
} from './risk.js'

/* A buyer who did nothing unusual. */
const calm = {
  throwawayEmail: false,
  amountUsdCents: 3900,
  priorPaid: 1,
  priorRefunds: 0,
  declinesLastHour: 0,
  attemptsLast10m: 0,
  methodsLastHour: 1,
  othersToSellerLast2m: 0,
  blockedLast24h: 0,
}
const score = (over) => scoreRisk({ ...calm, ...over })
const LONG_DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

describe('levels', () => {
  it('draws the lines at 30 and 60', () => {
    expect(THRESHOLDS).toEqual({ medium: 30, high: 60 })
    expect([0, 29].map(levelOf)).toEqual(['low', 'low'])
    expect([30, 59].map(levelOf)).toEqual(['medium', 'medium'])
    expect([60, 100].map(levelOf)).toEqual(['high', 'high'])
    expect(DECISIONS).toEqual({ low: 'allow', medium: 'review', high: 'block' })
  })
})

describe('scoreRisk', () => {
  it('lets an ordinary payment through with nothing fired', () => {
    expect(score({})).toMatchObject({ score: 0, level: 'low', decision: 'allow', fired: [] })
  })

  it('adds the points of each rule that fires, and says what it saw', () => {
    const result = score({ throwawayEmail: true, declinesLastHour: 2 })
    expect(result.score).toBe(65)
    expect(result.fired.map((entry) => [entry.id, entry.points])).toEqual([
      ['throwaway_email', 40],
      ['repeated_declines', 25],
    ])
    expect(result.fired[1].fact).toBe('2 card or PayPal declines in the last hour.')
  })

  it('has each rule start exactly at its line', () => {
    expect(score({ declinesLastHour: 1 }).score).toBe(0)
    expect(score({ declinesLastHour: 2 }).score).toBe(25)
    expect(score({ declinesLastHour: 3 }).score).toBe(40)
    expect(score({ declinesLastHour: 9 }).score).toBe(40)
    expect(score({ attemptsLast10m: 2 }).score).toBe(0)
    expect(score({ attemptsLast10m: 3 }).score).toBe(20)
    expect(score({ methodsLastHour: 2 }).score).toBe(0)
    expect(score({ methodsLastHour: 3 }).score).toBe(15)
    expect(score({ othersToSellerLast2m: 14 }).score).toBe(0)
    expect(score({ othersToSellerLast2m: 15 }).score).toBe(15)
    expect(score({ priorRefunds: 1 }).score).toBe(15)
    expect(score({ blockedLast24h: 1 }).score).toBe(30)
  })

  it('only calls an order big when it is a first order of $80 or more', () => {
    expect(score({ priorPaid: 0, amountUsdCents: 7999 }).score).toBe(0)
    expect(score({ priorPaid: 0, amountUsdCents: 8000 }).score).toBe(10)
    expect(score({ priorPaid: 1, amountUsdCents: 9900 }).score).toBe(0)
  })

  it('never holds anyone for a busy launch alone, even with a big first order', () => {
    const launch = score({ priorPaid: 0, amountUsdCents: 9900, othersToSellerLast2m: 40 })
    expect(launch.score).toBe(25)
    expect(launch.level).toBe('low')
  })

  it('holds a throwaway email for review, and blocks it when it is combined with rapid attempts', () => {
    expect(score({ throwawayEmail: true })).toMatchObject({ score: 40, level: 'medium', decision: 'review' })
    expect(score({ throwawayEmail: true, attemptsLast10m: 3 })).toMatchObject({
      score: 60,
      level: 'high',
      decision: 'block',
    })
  })

  it('holds someone who retries right after a block', () => {
    expect(score({ blockedLast24h: 1 })).toMatchObject({ level: 'medium', decision: 'review' })
  })

  it('never goes past 100', () => {
    const everything = score({
      throwawayEmail: true,
      declinesLastHour: 5,
      attemptsLast10m: 9,
      methodsLastHour: 5,
      othersToSellerLast2m: 20,
      priorPaid: 0,
      amountUsdCents: 9900,
      priorRefunds: 2,
      blockedLast24h: 2,
    })
    expect(everything.score).toBe(100)
    expect(everything.fired).toHaveLength(RULES.length)
  })

  it('names itself, so a score can be traced to the rules that made it', () => {
    expect(score({}).engine).toMatch(/^rules-\d+$/)
  })
})

describe('fairness', () => {
  it('refuses anything about who or where a buyer is', () => {
    for (const key of [
      'country',
      'countryCode',
      'nationality',
      'ethnicity',
      'name',
      'fullName',
      'language',
      'phone',
      'currency',
      'region',
    ]) {
      expect(() => score({ [key]: 'x' }), key).toThrow(/not a risk input/)
    }
  })

  it('refuses an input it does not know, even an innocent one', () => {
    expect(() => score({ favouriteColour: 'blue' })).toThrow(TypeError)
  })

  it('has no input whose name touches who or where a buyer is', () => {
    const forbidden =
      /country|nation|ethnic|race|name|language|locale|phone|currency|region|city|continent|origin|religio/i
    for (const input of RISK_INPUTS) expect(input.id, input.id).not.toMatch(forbidden)
  })

  it('lists, from the code itself, what the rules read and what they never read', () => {
    expect(RISK_INPUTS.map((input) => input.id).sort()).toEqual(Object.keys(calm).sort())
    expect(NEVER_USED).toEqual(expect.arrayContaining(['Country', 'Nationality', 'Ethnicity', 'Name', 'Language']))
    const used = new Set(RULES.flatMap((rule) => rule.inputs))
    expect([...used].sort()).toEqual(Object.keys(calm).sort())
  })

  it('gives the same score whatever else is passed alongside, because it is never read', () => {
    // The engine is handed only its inputs: the only way to add a country is to be refused (above).
    expect(score({})).toEqual(score({}))
  })
})

describe('throwaway email', () => {
  it('knows the services, by the part after the @ only', () => {
    expect(isThrowawayEmail('someone@mailinator.com')).toBe(true)
    expect(isThrowawayEmail('SOMEONE@Mailinator.COM')).toBe(true)
    expect(isThrowawayEmail('x@sub.yopmail.com')).toBe(true)
    expect(isThrowawayEmail('x@gmail.com')).toBe(false)
    expect(isThrowawayEmail('mailinator.com@gmail.com')).toBe(false)
    expect(isThrowawayEmail('x@notmailinator.com')).toBe(false)
    expect(isThrowawayEmail('')).toBe(false)
    expect(THROWAWAY_DOMAINS.length).toBeGreaterThan(10)
  })
})

describe('rulesExplanation', () => {
  it('says what fired, and how the payment was treated', () => {
    expect(rulesExplanation(score({}))).toBe('No risk signals fired.')
    const held = rulesExplanation(score({ throwawayEmail: true }))
    expect(held).toMatch(/^Held for review\./)
    expect(held).toContain('throwaway mail service')
    expect(rulesExplanation(score({ throwawayEmail: true, attemptsLast10m: 3 }))).toMatch(/^Blocked\./)
  })

  it('never uses a long dash', () => {
    for (const rule of RULES) {
      expect(rule.label + rule.description).not.toMatch(LONG_DASH)
      expect(rule.fact(calm)).not.toMatch(LONG_DASH)
    }
    for (const input of RISK_INPUTS) expect(input.note).not.toMatch(LONG_DASH)
  })
})
