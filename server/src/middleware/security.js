/* Browser-facing protections for the API: standard security headers and a strict CORS allowlist (the web app only).
   On Vercel the app and the API share one origin, so CORS only matters for local development on two ports. */
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

export const securityHeaders = () => secureHeaders({ crossOriginResourcePolicy: 'same-site' })

export function corsFor(env) {
  const allowed = new Set([env.appUrl])
  if (!env.isProduction) {
    allowed.add('http://localhost:5173')
    allowed.add('http://127.0.0.1:5173')
  }
  return cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    maxAge: 600,
  })
}
