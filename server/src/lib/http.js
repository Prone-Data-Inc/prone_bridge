/* Request helpers shared by the middleware. */
import { getConnInfo } from '@hono/node-server/conninfo'

/* The caller's address. x-forwarded-for is a header anyone can type, so it is only believed when the request context says
   a trusted proxy (Vercel's edge, a load balancer) wrote it (see trustProxy in config/env.js). Otherwise the address is the
   one on the connection, which cannot be faked. Without a context, nothing is trusted. */
export function clientIp(c) {
  if (c.get('trustProxy')) {
    const forwarded = c.req.header('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const real = c.req.header('x-real-ip')
    if (real) return real.trim()
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
