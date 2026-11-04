/* Builds the layers once and wires them together: services hold the rules, controllers turn requests into service
   calls. Repositories and integrations (database, PayPal, AI) join here as their steps land. */
import { createHealthController } from './controllers/health.controller.js'
import { createHealthService } from './services/health.service.js'

export function createContainer({ env }) {
  const healthService = createHealthService({ env })

  return {
    env,
    services: { health: healthService },
    controllers: { health: createHealthController({ healthService }) },
  }
}
