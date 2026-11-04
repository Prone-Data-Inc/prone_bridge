/* TLS settings for the database connection. The server's certificate is always verified: with Supabase's CA when one is
   given (DATABASE_SSL_CA as text, or DATABASE_SSL_CA_FILE as a path), otherwise with the system's trusted authorities.
   Only a database on this machine skips TLS. */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { ROOT } from '#server/config/dotenv.js'

/* Where the Supabase CA certificate is expected when no setting says otherwise. */
export const DEFAULT_CA_FILE = 'certs/supabase-ca.crt'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const isLocalDatabase = (url) => LOCAL_HOSTS.has(new URL(url).hostname)

/* The CA as PEM text. Accepts "\n" written as two characters, which is how a multi-line value often survives a .env file. */
export function readCa({ sslCa, sslCaFile }, defaultCaFile = DEFAULT_CA_FILE) {
  if (sslCa) return sslCa.replaceAll('\\n', '\n')
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
  const ca = readCa(database, defaultCaFile)
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true }
}

/* sslmode in the URL would override the settings above, so it is removed. */
export function withoutSslParams(url) {
  const parsed = new URL(url)
  for (const name of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(name)
  return parsed.toString()
}
