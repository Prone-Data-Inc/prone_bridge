/* The database handle every repository uses: { query, exec, tx, close }.
     query(text, params) -> rows        one statement with $1, $2 parameters
     exec(sql)                          several statements, no parameters (migrations)
     tx(fn)                             fn receives the same handle inside BEGIN ... COMMIT, rolled back on error
   Postgres over node-postgres in the app, PGlite in tests (see testing.js): both speak the same SQL. */
import pg from 'pg'
import { unavailable } from '#server/lib/errors.js'
import { sslFor, withoutSslParams } from './ssl.js'

/* numeric and bigint arrive as numbers where they are safe. Money is kept in integer cents, so bigint stays small. */
pg.types.setTypeParser(20, (value) => Number(value))
pg.types.setTypeParser(1700, (value) => Number(value))

const QUERY_TIMEOUT_MS = 15_000

/* Postgres reports its own errors (a bad query, a broken constraint) with a five character SQLSTATE code. Anything else
   (refused, timed out, certificate not trusted, connection dropped) means the database could not be reached. */
const SQLSTATE = /^[0-9A-Z]{5}$/
export const isConnectionError = (error) => !SQLSTATE.test(String(error?.code ?? ''))

/* Runs a database call, turning "could not reach it" into a clear 503 instead of a crash. */
const reachable = (logger) => (call) =>
  call.catch((error) => {
    if (!isConnectionError(error)) throw error
    logger?.warn('database not reachable', { code: error.code, reason: error.message })
    throw Object.assign(unavailable('The database is not reachable right now.'), { cause: error })
  })

export function createDb({ database, isServerless = false, logger }) {
  const pool = new pg.Pool({
    connectionString: withoutSslParams(database.url),
    ssl: sslFor(database),
    max: database.poolMax ?? (isServerless ? 1 : 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    allowExitOnIdle: isServerless,
  })
  /* An idle connection can be dropped by the pooler. That must never crash the process. */
  pool.on('error', (error) => logger?.warn('database connection error', { error: error.message }))

  const guard = reachable(logger)
  const handle = (runner) => ({
    query: async (text, params) => (await guard(runner.query(text, params))).rows,
    exec: async (sql) => {
      await guard(runner.query(sql))
    },
  })

  return {
    ...handle(pool),
    async tx(work) {
      const client = await guard(pool.connect())
      try {
        await client.query('begin')
        const result = await work(handle(client))
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/* The handle for this environment, or null when no database is configured yet. */
export function createDbFromEnv(env, logger) {
  if (!env.database.url) return null
  return createDb({ database: env.database, isServerless: env.isServerless, logger })
}
