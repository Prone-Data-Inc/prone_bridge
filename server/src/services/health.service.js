/* What the API reports about itself. For the database the answer is a real check: "connected" only when a query
   succeeds. PayPal and AI say "configured" when their keys exist; real checks arrive with those steps. */
import pkg from '../../../package.json' with { type: 'json' }

const CHECK_TIMEOUT_MS = 2500
const state = (ready) => (ready ? 'configured' : 'not_configured')

export function createHealthService({ env, db, now = () => new Date() }) {
  async function database() {
    if (!db) return 'not_configured'
    let timer
    try {
      await Promise.race([
        db.query('select 1'),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS)
        }),
      ])
      return 'connected'
    } catch {
      return 'unreachable'
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async check() {
      return {
        status: 'ok',
        service: 'pronebridge-api',
        version: pkg.version,
        environment: env.nodeEnv,
        time: now().toISOString(),
        integrations: {
          database: await database(),
          paypal: state(env.integrations.paypal),
          ai: state(env.integrations.ai),
        },
      }
    },
  }
}
