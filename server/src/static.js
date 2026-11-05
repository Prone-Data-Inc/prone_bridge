/* Serves the built web app from the same server (Docker and `npm start`). Hashed files under /assets are cached for a
   year; index.html is never cached so a new build shows up at once. Unknown paths fall back to index.html. */
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { CSP } from '#server/lib/csp.js'
import { securityHeaders } from '#server/middleware/security.js'

const DIST = join(import.meta.dirname, '..', '..', 'client', 'dist')

export function mountClient(app, { logger, dist = DIST } = {}) {
  if (!existsSync(join(dist, 'index.html'))) {
    logger?.warn('SERVE_CLIENT is on but client/dist is missing. Run npm run build first.')
    return
  }

  /* serveStatic reads paths relative to the working directory. */
  const root = relative(process.cwd(), dist).replaceAll('\\', '/') || '.'

  /* On Vercel these headers come from vercel.json, which carries the same policy (a test keeps the two equal). */
  app.use('/*', securityHeaders())
  app.use('/*', async (c, next) => {
    await next()
    c.header('Content-Security-Policy', CSP)
  })

  /* Set after the file is served: serveStatic's own onFound hook runs too late to change the response. */
  app.use('/*', async (c, next) => {
    await next()
    if (c.res.status === 200 && !c.res.headers.has('Cache-Control')) {
      c.header('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    }
  })
  app.use('/*', serveStatic({ root }))
  app.get('*', serveStatic({ root, path: 'index.html' }))
}
