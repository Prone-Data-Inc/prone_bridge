import { describe, expect, it } from 'vitest'
import { findLeakedKeys, guardBrowserKeys } from './guardBrowserKeys.js'

const jwt = (role) =>
  [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'c2ln',
  ].join('.')

describe('guardBrowserKeys', () => {
  it('flags a service role key in a VITE_ variable', () => {
    expect(findLeakedKeys({ VITE_SUPABASE_ANON_KEY: jwt('service_role') })).toEqual(['VITE_SUPABASE_ANON_KEY'])
  })

  it('accepts the anon key and unrelated values', () => {
    expect(findLeakedKeys({ VITE_SUPABASE_ANON_KEY: jwt('anon'), VITE_SUPABASE_URL: 'https://x.supabase.co' })).toEqual(
      [],
    )
  })

  it('ignores server-only variables, which never reach the browser', () => {
    expect(findLeakedKeys({ SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') })).toEqual([])
  })

  it('stops the build with a clear message and never prints the key', () => {
    const value = jwt('service_role')
    const plugin = guardBrowserKeys({ VITE_SUPABASE_ANON_KEY: value })
    expect(() => plugin.configResolved()).toThrow(/VITE_SUPABASE_ANON_KEY/)
    try {
      plugin.configResolved()
    } catch (error) {
      expect(error.message).not.toContain(value)
    }
  })

  it('lets a clean environment through', () => {
    expect(() => guardBrowserKeys({ VITE_SUPABASE_ANON_KEY: jwt('anon') }).configResolved()).not.toThrow()
  })
})
