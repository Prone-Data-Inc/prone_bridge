import { describe, expect, it } from 'vitest'
import { FAILURE_CODES } from '../../server/src/db/seed/data.js'
import { FAILURES, failureMessage } from './failures.js'

/* An en dash or an em dash, written as numbers so this file holds neither. */
const DASHES = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']')

describe('failures', () => {
  it('has a message for every failure code the demo data can contain', () => {
    for (const code of Object.values(FAILURE_CODES).flat()) expect(FAILURES[code], code).toBeTruthy()
  })

  it('has a plain fallback for an unknown code', () => {
    expect(failureMessage('something_new')).toBe('The payment did not go through.')
    expect(failureMessage(undefined)).toBe('The payment did not go through.')
  })

  it('writes short messages that end with a full stop and never use dashes', () => {
    for (const message of Object.values(FAILURES)) {
      expect(message.endsWith('.')).toBe(true)
      expect(message).not.toMatch(DASHES)
    }
  })
})
