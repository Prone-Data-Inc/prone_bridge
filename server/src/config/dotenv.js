/* Settings from the .env file at the repo root, when it exists. Real environment variables (Docker, Vercel) always win
   over the file. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = join(import.meta.dirname, '..', '..', '..')

export function loadDotenv(file = join(ROOT, '.env')) {
  if (existsSync(file)) process.loadEnvFile(file)
}
