/* Node entry: local development (`npm run dev`), `npm start` and Docker. Vercel uses api/index.js instead. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from '#server/app.js'
import { getEnv } from '#server/config/env.js'
import { createLogger } from '#server/lib/logger.js'

/* Settings from .env when the file exists. Real environment variables (Docker, a host) always win over the file. */
const dotenv = join(import.meta.dirname, '..', '..', '.env')
if (existsSync(dotenv)) process.loadEnvFile(dotenv)

const env = getEnv()
const logger = createLogger({ level: env.logLevel, json: env.isProduction })
const app = createApp({ env, logger })

const server = serve({ fetch: app.fetch, hostname: env.host, port: env.port }, (info) => {
  logger.info('api ready', {
    url: `http://${info.address === '::' ? 'localhost' : info.address}:${info.port}`,
    environment: env.nodeEnv,
  })
})

function shutdown(signal) {
  logger.info('shutting down', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
