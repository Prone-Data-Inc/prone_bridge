/* Builds the layers once and wires them together: repositories talk to the database, services hold the rules,
   controllers turn requests into service calls. With no database configured, the pieces that need one answer
   "not available yet" instead of failing. PayPal joins here; the AI joins in its step. PayPal's client can be passed in,
   so tests run without the network. */
import { createCatalogController } from './controllers/catalog.controller.js'
import { createCheckoutController } from './controllers/checkout.controller.js'
import { createHealthController } from './controllers/health.controller.js'
import { createLearnerController } from './controllers/learner.controller.js'
import { createNotificationController } from './controllers/notification.controller.js'
import { createPaypalController } from './controllers/paypal.controller.js'
import { createPayoutController } from './controllers/payout.controller.js'
import { createSimulatorController } from './controllers/simulator.controller.js'
import { createWebhookController } from './controllers/webhook.controller.js'
import { createPaypalClient } from './integrations/paypal/client.js'
import { unavailable } from './lib/errors.js'
import { createCatalogRepository } from './repositories/catalog.repository.js'
import { createNotificationRepository } from './repositories/notification.repository.js'
import { createCatalogService } from './services/catalog.service.js'
import { createCheckoutService } from './services/checkout.service.js'
import { createHealthService } from './services/health.service.js'
import { createLearnerService } from './services/learner.service.js'
import { createNotificationService } from './services/notification.service.js'
import { createPaypalService } from './services/paypal.service.js'
import { createPayoutService } from './services/payout.service.js'
import { createSettlementService } from './services/settlement.service.js'
import { createSimulatorService } from './services/simulator.service.js'
import { createWebhookService } from './services/webhook.service.js'

/* A service whose every call says the database is missing, for an app started without one. */
const offline = () =>
  new Proxy(
    {},
    {
      get: () => async () => {
        throw unavailable('The database is not connected yet.')
      },
    },
  )

export function createContainer({ env, db, logger, paypal = createPaypalClient({ config: env.paypal }) }) {
  const catalogRepository = db ? createCatalogRepository({ db }) : null
  const notificationRepository = db ? createNotificationRepository({ db }) : null

  const healthService = createHealthService({ env, db })
  const catalogService = createCatalogService({ repository: catalogRepository })
  const notificationService = createNotificationService({ repository: notificationRepository, catalogRepository })

  const settlementService = db ? createSettlementService({ db }) : offline()
  const paypalService = createPaypalService({ db, paypal, settlement: settlementService, env, logger })
  const checkoutService = db ? createCheckoutService({ db, catalogRepository, paypal: paypalService }) : offline()
  const simulatorService = db ? createSimulatorService({ db, settlement: settlementService }) : offline()
  const learnerService = db ? createLearnerService({ db }) : offline()
  const payoutService = db ? createPayoutService({ db, paypal, catalogRepository, env, logger }) : offline()
  const webhookService = db
    ? createWebhookService({
        db,
        paypal,
        paypalService,
        settlement: settlementService,
        payouts: payoutService,
        logger,
      })
    : offline()

  return {
    env,
    db,
    services: {
      health: healthService,
      catalog: catalogService,
      notifications: notificationService,
      settlement: settlementService,
      paypal: paypalService,
      checkout: checkoutService,
      simulator: simulatorService,
      learners: learnerService,
      payouts: payoutService,
      webhooks: webhookService,
    },
    controllers: {
      health: createHealthController({ healthService }),
      catalog: createCatalogController({ catalogService }),
      notifications: createNotificationController({ notificationService }),
      checkout: createCheckoutController({ checkoutService, paypalService }),
      paypal: createPaypalController({ paypalService }),
      simulator: createSimulatorController({ simulatorService }),
      learners: createLearnerController({ learnerService }),
      payouts: createPayoutController({ payoutService }),
      webhooks: createWebhookController({ webhookService }),
    },
  }
}
