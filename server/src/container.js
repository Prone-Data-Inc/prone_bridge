/* Builds the layers once and wires them together: repositories talk to the database, services hold the rules,
   controllers turn requests into service calls. With no database configured, the pieces that need one answer
   "not available yet" instead of failing. PayPal's and OpenAI's clients can be passed in, so tests run without the
   network. */
import { createAdminController } from './controllers/admin.controller.js'
import { createCatalogController } from './controllers/catalog.controller.js'
import { createCopilotController } from './controllers/copilot.controller.js'
import { createDemoController } from './controllers/demo.controller.js'
import { createCheckoutController } from './controllers/checkout.controller.js'
import { createHealthController } from './controllers/health.controller.js'
import { createLearnerController } from './controllers/learner.controller.js'
import { createLinkController } from './controllers/link.controller.js'
import { createSellerController } from './controllers/seller.controller.js'
import { createNotificationController } from './controllers/notification.controller.js'
import { createPaypalController } from './controllers/paypal.controller.js'
import { createPayoutController } from './controllers/payout.controller.js'
import { createSimulatorController } from './controllers/simulator.controller.js'
import { createWebhookController } from './controllers/webhook.controller.js'
import { createOpenAiClient } from './integrations/openai/client.js'
import { createPaypalClient } from './integrations/paypal/client.js'
import { unavailable } from './lib/errors.js'
import { createCatalogRepository } from './repositories/catalog.repository.js'
import { createNotificationRepository } from './repositories/notification.repository.js'
import { createAdminService } from './services/admin.service.js'
import { createAiService } from './services/ai.service.js'
import { createCatalogService } from './services/catalog.service.js'
import { createCheckoutService } from './services/checkout.service.js'
import { createCopilotService } from './services/copilot.service.js'
import { createHealthService } from './services/health.service.js'
import { createLearnerService } from './services/learner.service.js'
import { createLinkService } from './services/link.service.js'
import { createMatchService } from './services/match.service.js'
import { createNotificationService } from './services/notification.service.js'
import { createPaypalService } from './services/paypal.service.js'
import { createPayoutService } from './services/payout.service.js'
import { createRiskService } from './services/risk.service.js'
import { createScenarioService } from './services/scenario.service.js'
import { createSellerService } from './services/seller.service.js'
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

export function createContainer({
  env,
  db,
  logger,
  paypal = createPaypalClient({ config: env.paypal }),
  openai = createOpenAiClient({ config: env.ai }),
  now = () => new Date(),
}) {
  const catalogRepository = db ? createCatalogRepository({ db }) : null
  const notificationRepository = db ? createNotificationRepository({ db }) : null

  const healthService = createHealthService({ env, db })
  const catalogService = createCatalogService({ repository: catalogRepository })
  const notificationService = createNotificationService({ repository: notificationRepository, catalogRepository })

  const aiService = createAiService({ client: openai, db, env, logger, now })
  const riskService = db ? createRiskService({ db, ai: aiService, logger }) : offline()
  const settlementService = db ? createSettlementService({ db }) : offline()
  const paypalService = createPaypalService({ db, paypal, settlement: settlementService, env, logger })
  const checkoutService = db
    ? createCheckoutService({ db, catalogRepository, paypal: paypalService, risk: riskService, now })
    : offline()
  const matchService = db ? createMatchService({ db, catalogRepository, now }) : offline()
  const simulatorService = db ? createSimulatorService({ db, settlement: settlementService }) : offline()
  const learnerService = db ? createLearnerService({ db }) : offline()
  const payoutService = db ? createPayoutService({ db, paypal, catalogRepository, env, logger }) : offline()
  const sellerService = db ? createSellerService({ db, catalogRepository, paypal, env, now }) : offline()
  const linkService = db ? createLinkService({ db, now }) : offline()
  const adminService = db
    ? createAdminService({ db, risk: riskService, payouts: payoutService, ai: aiService, catalogRepository, now })
    : offline()
  const scenarioService = db
    ? createScenarioService({
        db,
        catalogRepository,
        checkout: checkoutService,
        simulator: simulatorService,
        admin: adminService,
        payouts: payoutService,
        match: matchService,
        risk: riskService,
        ai: aiService,
        env,
        now,
      })
    : offline()
  const copilotService = db
    ? createCopilotService({
        db,
        ai: aiService,
        seller: sellerService,
        match: matchService,
        payouts: payoutService,
        catalogRepository,
        logger,
        now,
      })
    : offline()
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
      seller: sellerService,
      links: linkService,
      ai: aiService,
      risk: riskService,
      match: matchService,
      admin: adminService,
      copilot: copilotService,
      demo: scenarioService,
    },
    controllers: {
      health: createHealthController({ healthService }),
      catalog: createCatalogController({ catalogService }),
      notifications: createNotificationController({ notificationService }),
      checkout: createCheckoutController({ checkoutService, paypalService, matchService }),
      paypal: createPaypalController({ paypalService }),
      simulator: createSimulatorController({ simulatorService }),
      learners: createLearnerController({ learnerService }),
      payouts: createPayoutController({ payoutService }),
      webhooks: createWebhookController({ webhookService }),
      seller: createSellerController({ sellerService }),
      links: createLinkController({ linkService }),
      admin: createAdminController({ adminService }),
      copilot: createCopilotController({ copilotService }),
      demo: createDemoController({ scenarioService }),
    },
  }
}
