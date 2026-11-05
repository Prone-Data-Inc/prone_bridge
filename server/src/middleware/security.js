/* Browser-facing protections for the API: standard security headers and a strict CORS allowlist (the web app only).
   On Vercel the app and the API share one origin, so CORS only matters for local development on two ports. */
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { OPENER_POLICY } from '#server/lib/csp.js'

/* crossOriginOpenerPolicy: Hono's default cuts a page off from the popups it opens, which PayPal needs.
   xFrameOptions and referrerPolicy: the same as vercel.json says, so the app behaves the same on either server. */
export const securityHeaders = () =>
  secureHeaders({
    crossOriginResourcePolicy: 'same-site',
    crossOriginOpenerPolicy: OPENER_POLICY,
    xFrameOptions: 'DENY',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })

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
