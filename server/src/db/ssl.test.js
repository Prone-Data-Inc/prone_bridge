import { X509Certificate } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isLocalDatabase, isSupabaseDatabase, normalizePem, readCa, sslFor, withoutSslParams } from './ssl.js'
import { SUPABASE_ROOT_CA } from './supabaseCa.js'

const remote = ['postgresql://postgres', 'pw-for-tests@db.example.supabase.co:5432/postgres'].join(':')
const pooler = [
  'postgresql://postgres.abcdefghijklmnop',
  'pw-for-tests@aws-0-eu-west-3.pooler.supabase.com:6543/postgres',
].join(':')
const elsewhere = ['postgresql://postgres', 'pw-for-tests@db.example.com:5432/postgres'].join(':')
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'

describe('database TLS', () => {
  let dir
  let none

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pb-ca-'))
    none = join(dir, 'none.crt')
    writeFileSync(join(dir, 'ca.crt'), PEM)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('skips TLS only for a database on this machine', () => {
    expect(isLocalDatabase('postgresql://u:p@localhost:5432/db')).toBe(true)
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/db')).toBe(true)
    expect(isLocalDatabase(remote)).toBe(false)
    expect(sslFor({ url: 'postgresql://u:p@localhost:5432/db' })).toBe(false)
  })

  it('recognises a Supabase database, direct or pooler, and nothing that only looks like one', () => {
    expect(isSupabaseDatabase(remote)).toBe(true)
    expect(isSupabaseDatabase(pooler)).toBe(true)
    expect(isSupabaseDatabase(elsewhere)).toBe(false)
    expect(isSupabaseDatabase('postgresql://u:p@notsupabase.co:5432/db')).toBe(false)
    expect(isSupabaseDatabase('postgresql://u:p@supabase.co.example.com:5432/db')).toBe(false)
  })

  it('always verifies a remote server, with the system authorities when it is not a Supabase one', () => {
    expect(sslFor({ url: elsewhere }, { defaultCaFile: none })).toEqual({ rejectUnauthorized: true })
  })

  it('trusts the built-in Supabase root for a Supabase database, so no setting is needed', () => {
    for (const url of [remote, pooler]) {
      expect(sslFor({ url }, { defaultCaFile: none })).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true })
    }
  })

  it('has the real Supabase root certificate built in: self-signed and not expired', () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA)
    expect(certificate.subject).toContain('Supabase Root 2021 CA')
    expect(certificate.issuer).toBe(certificate.subject)
    expect(certificate.ca).toBe(true)
    expect(new Date(certificate.validTo).getTime()).toBeGreaterThan(Date.now())
  })

  it('uses the certificate in the default place when it exists, without any setting', () => {
    expect(sslFor({ url: remote }, { defaultCaFile: join(dir, 'ca.crt') })).toEqual({
      ca: PEM,
      rejectUnauthorized: true,
    })
  })

  it('verifies against the CA when one is given as text', () => {
    expect(sslFor({ url: remote, sslCa: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true })
  })

  it('accepts a CA written on one line with \\n', () => {
    const oneLine = PEM.replaceAll('\n', '\\n')
    expect(readCa({ sslCa: oneLine })).toBe(PEM)
  })

  it('repairs a certificate that lost its line breaks, came in quotes, or came with Windows line ends', () => {
    const original = new X509Certificate(SUPABASE_ROOT_CA).fingerprint256
    const flattened = SUPABASE_ROOT_CA.trim().replaceAll('\n', ' ')
    const quoted = `"${SUPABASE_ROOT_CA.trim().replaceAll('\n', '\\n')}"`
    const windows = SUPABASE_ROOT_CA.replaceAll('\n', '\r\n')
    for (const text of [flattened, quoted, windows, `  ${SUPABASE_ROOT_CA}  `]) {
      const repaired = normalizePem(text)
      expect(new X509Certificate(repaired).fingerprint256).toBe(original)
      expect(repaired).toBe(SUPABASE_ROOT_CA)
    }
  })

  it('keeps several certificates, and drops what is not one', () => {
    const two = `noise ${PEM} between ${PEM} after`
    expect(normalizePem(two)).toBe(PEM + PEM)
    expect(normalizePem('not a certificate')).toBe('')
    expect(normalizePem(undefined)).toBe('')
  })

  it('counts a CA setting with no certificate in it as not set', () => {
    expect(readCa({ sslCa: 'paste the certificate here' }, none)).toBeUndefined()
    expect(sslFor({ url: remote, sslCa: 'paste the certificate here' }, { defaultCaFile: none })).toEqual({
      ca: SUPABASE_ROOT_CA,
      rejectUnauthorized: true,
    })
  })

  it('reads the CA from a file', () => {
    expect(sslFor({ url: remote, sslCaFile: join(dir, 'ca.crt') })).toEqual({ ca: PEM, rejectUnauthorized: true })
  })

  it('says so when the CA file is missing', () => {
    expect(() => sslFor({ url: remote, sslCaFile: join(dir, 'missing.crt') })).toThrow(/does not exist/)
  })

  it('never lets the URL weaken the settings', () => {
    const cleaned = withoutSslParams(`${remote}?sslmode=disable&application_name=pb`)
    expect(cleaned).not.toContain('sslmode')
    expect(cleaned).toContain('application_name=pb')
  })
})
