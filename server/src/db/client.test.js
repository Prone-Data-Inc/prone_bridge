import { describe, expect, it } from 'vitest'
import { createDb, isConnectionError } from './client.js'

describe('isConnectionError', () => {
  it('treats network and TLS failures as not reachable', () => {
    expect(isConnectionError({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isConnectionError({ code: 'ENOTFOUND' })).toBe(true)
    expect(isConnectionError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' })).toBe(true)
    expect(isConnectionError(new Error('Connection terminated unexpectedly'))).toBe(true)
  })

  it('leaves Postgres own errors alone', () => {
    expect(isConnectionError({ code: '42P01' })).toBe(false)
    expect(isConnectionError({ code: '23505' })).toBe(false)
    expect(isConnectionError({ code: '57014' })).toBe(false)
  })
})

describe('createDb', () => {
  it('answers a clear 503 when the database cannot be reached', async () => {
    const warnings = []
    const logger = { warn: (message, fields) => warnings.push({ message, fields }) }
    /* Nothing listens on this port, so the connection is refused at once. */
    const db = createDb({ database: { url: 'postgresql://u:p@127.0.0.1:1/none' }, logger })
    await expect(db.query('select 1')).rejects.toMatchObject({ status: 503, code: 'unavailable' })
    expect(warnings[0].message).toBe('database not reachable')
    await expect(db.query('select 1')).rejects.toHaveProperty('cause.code', 'ECONNREFUSED')
    await db.close()
  })
})
