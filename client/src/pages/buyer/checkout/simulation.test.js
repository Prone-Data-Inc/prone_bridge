import { describe, expect, it } from 'vitest'
import { OUTCOMES, instructionsFor, testPhone, timing } from './simulation.js'

describe('simulation', () => {
  it('offers the three ways a simulated payment can end', () => {
    expect(OUTCOMES.map((outcome) => outcome.value)).toEqual(['approve', 'decline', 'timeout'])
    expect(OUTCOMES.map((outcome) => outcome.label)).toEqual(['Approve', 'Decline', 'Time out'])
  })

  it('waits a few seconds by default, so the waiting screen can be seen', () => {
    expect(timing.waitMs).toBeGreaterThanOrEqual(2000)
    expect(timing.waitMs).toBeLessThanOrEqual(5000)
  })

  it('makes a test phone number from the dial code', () => {
    expect(testPhone('+225')).toBe('+225 07 00 00 00 00')
    expect(testPhone()).toBe('07 00 00 00 00')
  })

  it('shows the same codes for the same payment, and different ones for another', () => {
    const first = instructionsFor('pb_AB12CD34EF56')
    expect(instructionsFor('pb_AB12CD34EF56')).toEqual(first)
    expect(instructionsFor('pb_ZZ99YY88XX77')).not.toEqual(first)
  })

  it('shapes the codes like the real thing, but obviously made up', () => {
    const { ussd, voucher, bank } = instructionsFor('pb_AB12CD34EF56')
    expect(ussd).toMatch(/^\*384\*\d{4}#$/)
    expect(voucher).toBe('VC-AB12-CD34')
    expect(bank).toEqual({ name: 'ProneBridge Collections', number: '0000 0000 00', reference: 'pb_AB12CD34EF56' })
  })
})
