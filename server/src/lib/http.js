/* Request helpers shared by the middleware. */
import { getConnInfo } from '@hono/node-server/conninfo'

/* The caller's address. On Vercel the edge sets x-forwarded-for; behind a local Node server the socket knows it. */
export function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = c.req.header('x-real-ip')
  if (real) return real.trim()
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
