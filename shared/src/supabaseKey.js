/* What kind of Supabase key is this? Used to stop a secret (service role) from ever being placed in a VITE_ variable,
   because everything that starts with VITE_ is shipped to the browser. Reads the key's role, never prints the key. */

const decode = (part) => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/* 'empty' | 'public' (safe for the browser) | 'secret' (never in the browser) | 'unknown' */
export function inspectSupabaseKey(value) {
  const key = String(value ?? '').trim()
  if (!key) return 'empty'
  if (key.startsWith('sb_publishable_')) return 'public'
  if (key.startsWith('sb_secret_')) return 'secret'
  const parts = key.split('.')
  if (parts.length !== 3) return 'unknown'
  const role = decode(parts[1])?.role
  if (role === 'anon') return 'public'
  if (role === 'service_role') return 'secret'
  return 'unknown'
}
