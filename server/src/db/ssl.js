/* TLS settings for the database connection. The server's certificate is always verified: with the CA given in
   DATABASE_SSL_CA (text) or DATABASE_SSL_CA_FILE (a path), or the file in certs/, or for a Supabase host the Supabase
   root certificate that is built in, otherwise with the system's trusted authorities. Only a database on this machine
   skips TLS. */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { ROOT } from '#server/config/dotenv.js'
import { SUPABASE_ROOT_CA } from './supabaseCa.js'

/* Where the Supabase CA certificate is expected when no setting says otherwise. */
export const DEFAULT_CA_FILE = 'certs/supabase-ca.crt'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const isLocalDatabase = (url) => LOCAL_HOSTS.has(new URL(url).hostname)

/* db.<project>.supabase.co, and the poolers at *.pooler.supabase.com. */
export const isSupabaseDatabase = (url) => /(^|\.)supabase\.(co|com)$/i.test(new URL(url).hostname)

const CERTIFICATE = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g

/* The certificates in a setting, as clean PEM. A settings page or a .env file can turn the line breaks into spaces, write
   them out as the two characters \n, or wrap the whole value in quotes, and OpenSSL reads none of those. Anything that is
   not a certificate is dropped. An empty string means there is no certificate in it. */
export function normalizePem(text) {
  const written = String(text ?? '').replaceAll('\\n', '\n')
  return [...written.matchAll(CERTIFICATE)]
    .map(([, body]) => body.replace(/[^A-Za-z0-9+/=]/g, ''))
    .filter(Boolean)
    .map((body) => `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`)
    .join('')
}

/* The CA as PEM text, or undefined when nothing is set. A DATABASE_SSL_CA with no certificate in it counts as not set. */
export function readCa({ sslCa, sslCaFile }, defaultCaFile = DEFAULT_CA_FILE) {
  const fromText = normalizePem(sslCa)
  if (fromText) return fromText
  const wanted = sslCaFile || defaultCaFile
  const file = isAbsolute(wanted) ? wanted : join(ROOT, wanted)
  if (!sslCaFile && !existsSync(file)) return undefined
  if (!existsSync(file)) {
    throw new Error(`DATABASE_SSL_CA_FILE points to ${wanted}, but that file does not exist.`)
  }
  return readFileSync(file, 'utf8')
}

export function sslFor(database, { defaultCaFile } = {}) {
  if (isLocalDatabase(database.url)) return false
  const ca = readCa(database, defaultCaFile) ?? (isSupabaseDatabase(database.url) ? SUPABASE_ROOT_CA : undefined)
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true }
}

/* sslmode in the URL would override the settings above, so it is removed. */
export function withoutSslParams(url) {
  const parsed = new URL(url)
  for (const name of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(name)
  return parsed.toString()
}
