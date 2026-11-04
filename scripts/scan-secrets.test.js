import { describe, expect, it } from 'vitest'
import { isSecretFileName, scanText } from './scan-secrets.js'

/* Fake secrets are built at run time so this file never contains one that would trip the scanner itself. */
const fake = {
  openai: `sk-proj-${'a1B2'.repeat(10)}`,
  jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoic2VydmljZV9yb2xlIn0', 'c2lnbmF0dXJlMTIzNDU2'].join('.'),
  github: `ghp_${'x9Y8'.repeat(9)}`,
  aws: `AKIA${'Q'.repeat(16)}`,
  url: ['postgresql://postgres', 's3cretpass@db.example.supabase.co:5432/postgres'].join(':'),
  privateKey: ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
  paypalSecret: `E${'k3L9'.repeat(10)}`,
}

const rules = (text) => scanText(text).map((finding) => finding.rule)

describe('scanText', () => {
  it('finds an OpenAI style key', () => {
    expect(rules(`const key = "${fake.openai}"`)).toContain('openai-key')
  })

  it('finds a JWT (Supabase keys are JWTs)', () => {
    expect(rules(`SUPABASE_KEY=${fake.jwt}`)).toContain('jwt')
  })

  it('finds GitHub tokens, AWS keys, private keys and database URLs with a password', () => {
    expect(rules(fake.github)).toContain('github-token')
    expect(rules(fake.aws)).toContain('aws-access-key')
    expect(rules(fake.privateKey)).toContain('private-key')
    expect(rules(`DATABASE_URL=${fake.url}`)).toContain('database-url-with-password')
  })

  it('finds a long value assigned to a secret-like name', () => {
    expect(rules(`PAYPAL_CLIENT_SECRET=${fake.paypalSecret}`)).toEqual(['secret-assignment'])
    expect(rules(`  "OPENAI_API_KEY": "${fake.paypalSecret}"`)).toEqual(['secret-assignment'])
  })

  it('reports the line number and never the value', () => {
    const findings = scanText(`one\ntwo\nPAYPAL_CLIENT_SECRET=${fake.paypalSecret}`)
    expect(findings).toEqual([{ line: 3, rule: 'secret-assignment' }])
    expect(JSON.stringify(findings)).not.toContain(fake.paypalSecret)
  })

  it('accepts empty values, placeholders, code and short values', () => {
    expect(scanText('PAYPAL_CLIENT_SECRET=')).toEqual([])
    expect(scanText('OPENAI_API_KEY=your-key-goes-here-please')).toEqual([])
    expect(scanText('PAYPAL_CLIENT_SECRET=process.env.PAYPAL_CLIENT_SECRET')).toEqual([])
    expect(scanText("PAYPAL_CLIENT_SECRET: z.string().default('')")).toEqual([])
    expect(scanText('PASSWORD_MIN=12')).toEqual([])
    expect(scanText('const token = await getToken()')).toEqual([])
  })

  it('skips a line marked secret-scan:allow', () => {
    expect(scanText(`${fake.openai} // secret-scan:allow`)).toEqual([])
  })
})

describe('isSecretFileName', () => {
  it('blocks .env files and key files but not .env.example', () => {
    expect(isSecretFileName('.env')).toBe(true)
    expect(isSecretFileName('server/.env.local')).toBe(true)
    expect(isSecretFileName('certs/private.pem')).toBe(true)
    expect(isSecretFileName('id_rsa')).toBe(true)
    expect(isSecretFileName('.env.example')).toBe(false)
    expect(isSecretFileName('src/environment.js')).toBe(false)
  })
})
