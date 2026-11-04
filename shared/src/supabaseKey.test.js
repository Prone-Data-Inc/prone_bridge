import { describe, expect, it } from 'vitest'
import { inspectSupabaseKey } from './supabaseKey.js'

/* Test keys are built at run time so this file holds no real-looking secret. */
const jwt = (payload) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'c2lnbmF0dXJl',
  ].join('.')

describe('inspectSupabaseKey', () => {
  it('knows an anon key is public', () => {
    expect(inspectSupabaseKey(jwt({ role: 'anon', ref: 'abc' }))).toBe('public')
  })

  it('knows a service role key is secret', () => {
    expect(inspectSupabaseKey(jwt({ role: 'service_role', ref: 'abc' }))).toBe('secret')
  })

  it('knows the newer key formats', () => {
    expect(inspectSupabaseKey(['sb', 'publishable', 'abc123'].join('_') + '_x')).toBe('public')
    expect(inspectSupabaseKey(['sb', 'secret', 'abc123'].join('_') + '_x')).toBe('secret')
  })

  it('does not trust what it cannot read', () => {
    expect(inspectSupabaseKey('')).toBe('empty')
    expect(inspectSupabaseKey(undefined)).toBe('empty')
    expect(inspectSupabaseKey('not-a-key')).toBe('unknown')
    expect(inspectSupabaseKey(jwt({ role: 'authenticated' }))).toBe('unknown')
    expect(inspectSupabaseKey('a.b.c')).toBe('unknown')
  })
})
