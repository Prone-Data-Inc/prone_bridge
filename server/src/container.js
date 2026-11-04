/* Builds the layers once and wires them together: repositories talk to the database, services hold the rules,
   controllers turn requests into service calls. With no database configured, the pieces that need one answer
   "not available yet" instead of failing. PayPal and AI integrations join here in their steps. */
import { createCatalogController } from './controllers/catalog.controller.js'
import { createHealthController } from './controllers/health.controller.js'
import { createCatalogRepository } from './repositories/catalog.repository.js'
import { createCatalogService } from './services/catalog.service.js'
import { createHealthService } from './services/health.service.js'

export function createContainer({ env, db }) {
  const catalogRepository = db ? createCatalogRepository({ db }) : null

  const healthService = createHealthService({ env, db })
  const catalogService = createCatalogService({ repository: catalogRepository })

  return {
    env,
    db,
    services: { health: healthService, catalog: catalogService },
    controllers: {
      health: createHealthController({ healthService }),
      catalog: createCatalogController({ catalogService }),
    },
  }
}
