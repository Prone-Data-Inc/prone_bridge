/* What the API reports about itself. "configured" means the keys are present; real connection checks arrive with each
   integration (database in step 2, PayPal in step 5, AI in step 7). */
import pkg from '../../../package.json' with { type: 'json' }

const state = (ready) => (ready ? 'configured' : 'not_configured')

export function createHealthService({ env, now = () => new Date() }) {
  return {
    check() {
      return {
        status: 'ok',
        service: 'pronebridge-api',
        version: pkg.version,
        environment: env.nodeEnv,
        time: now().toISOString(),
        integrations: {
          database: state(env.integrations.database),
          paypal: state(env.integrations.paypal),
          ai: state(env.integrations.ai),
        },
      }
    },
  }
}
