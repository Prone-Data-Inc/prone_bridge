import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isLocalDatabase, readCa, sslFor, withoutSslParams } from './ssl.js'

const remote = ['postgresql://postgres', 'pw-for-tests@db.example.supabase.co:5432/postgres'].join(':')
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n'

describe('database TLS', () => {
  let dir

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'pb-ca-'))
    writeFileSync(join(dir, 'ca.crt'), PEM)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('skips TLS only for a database on this machine', () => {
    expect(isLocalDatabase('postgresql://u:p@localhost:5432/db')).toBe(true)
    expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/db')).toBe(true)
    expect(isLocalDatabase(remote)).toBe(false)
    expect(sslFor({ url: 'postgresql://u:p@localhost:5432/db' })).toBe(false)
  })

  it('always verifies a remote server, with the system authorities by default', () => {
    expect(sslFor({ url: remote })).toEqual({ rejectUnauthorized: true })
  })

  it('verifies against the Supabase CA when one is given as text', () => {
    expect(sslFor({ url: remote, sslCa: PEM })).toEqual({ ca: PEM, rejectUnauthorized: true })
  })

  it('accepts a CA written on one line with \\n', () => {
    const oneLine = PEM.replaceAll('\n', '\\n')
    expect(readCa({ sslCa: oneLine })).toBe(PEM)
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
