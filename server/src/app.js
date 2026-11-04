/* The whole backend as one web-standard app (Request in, Response out). The same object runs on Vercel (api/index.js),
   on Node (index.js) and inside Docker, and tests call it directly with app.request().
   Layers: routes -> controllers -> services -> repositories/integrations (wired in container.js). */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getEnv } from '#server/config/env.js'
import { createContainer } from '#server/container.js'
import { createDbFromEnv } from '#server/db/client.js'
import { createLogger } from '#server/lib/logger.js'
import { payloadTooLarge } from '#server/lib/errors.js'
import { errorBody } from '#server/lib/response.js'
import { createErrorHandler, notFoundHandler } from '#server/middleware/errorHandler.js'
import { rateLimit } from '#server/middleware/rateLimit.js'
import { requestContext } from '#server/middleware/requestContext.js'
import { corsFor, securityHeaders } from '#server/middleware/security.js'
import { createRoutes } from '#server/routes/index.js'
import { mountClient } from '#server/static.js'

const MAX_BODY_BYTES = 1024 * 1024

/* paypal: tests pass a stand-in for PayPal's client. Left out, the real one is used (the sandbox only). */
export function createApp({
  env = getEnv(),
  logger = defaultLogger(env),
  db = createDbFromEnv(env, logger),
  paypal,
} = {}) {
  const container = createContainer({ env, db, logger, paypal })
  const api = new Hono()

  api.use('*', requestContext({ logger }))
  api.use('*', securityHeaders())
  api.use('*', corsFor(env))
  api.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => {
        const error = payloadTooLarge()
        return c.json(errorBody(c, error.code, error.message), error.status)
      },
    }),
  )
  api.use('*', rateLimit({ name: 'api', max: 240, windowMs: 60_000 }))
  api.route('/', createRoutes(container))

  const app = new Hono()
  app.route('/api', api)
  app.onError(createErrorHandler({ logger }))
  app.notFound(notFoundHandler)

  /* In Docker one server also hands out the built web app. On Vercel the CDN does that, so this stays off. */
  if (env.serveClient) mountClient(app, { logger })

  return app
}

function defaultLogger(env) {
  return createLogger({ level: env.logLevel, json: env.isProduction })
}
