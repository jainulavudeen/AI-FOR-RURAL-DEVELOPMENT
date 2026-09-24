import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from './plugins/auth.js'
import corsPlugin from './plugins/cors.js'
import dbPlugin from './plugins/db.js'
import errorHandlerPlugin from './plugins/errorHandler.js'
import redisPlugin from './plugins/redis.js'
import accountAggregatorModule from './modules/accountAggregator/index.js'
import adminModule from './modules/admin/index.js'
import advisorSaathiModule from './modules/advisorSaathi/index.js'
import authModule from './modules/auth/index.js'
import bankDossierModule from './modules/bankDossier/index.js'
import bankStatementModule from './modules/bankStatement/index.js'
import businessTypesModule from './modules/businessTypes/index.js'
import calculatorModule from './modules/calculator/index.js'
import creditScoreModule from './modules/creditScore/index.js'
import feasibilityModule from './modules/feasibility/index.js'
import feedbackModule from './modules/feedback/index.js'
import geographyModule from './modules/geography/index.js'
import groundingModule from './modules/grounding/index.js'
import ledgerModule from './modules/ledger/index.js'
import notificationModule from './modules/notification/index.js'
import schemeRouterModule from './modules/schemeRouter/index.js'
import siteCaptureModule from './modules/siteCapture/index.js'
import ussdModule from './modules/ussd/index.js'

// One deployable unit — six original modules plus accountAggregator,
// siteCapture, ussd, ledger, creditScore, advisorSaathi, bankDossier,
// admin, and now geography, deliberate exceptions (see CLAUDE.md:
// consented external data acquisition, geotagged evidence capture, a
// non-smartphone access rail, a daily-use transaction ledger, an
// explainable alternative-credit score, a grounded chat advisor, a
// frozen-snapshot printable document, a read-only oversight role above
// officer — admin never writes anything except reassigning an appeal's
// officer, see modules/admin/service.ts — and now real nationwide
// administrative reference data (states/districts/blocks by real Census
// name, replacing the old 8-state mock catalogue and numbered
// placeholders — see ingestion/adminHierarchy/), none of which
// semantically belong inside any of the original six. advisorSaathi never imports llm/client.ts itself — only
// grounding/service.ts may (boundary rule 2) — it calls that module's
// queryWithClaims() export instead, a plain function call within this one
// deployable unit, not a network hop.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true })

  app.register(errorHandlerPlugin)
  app.register(corsPlugin)
  app.register(dbPlugin)
  app.register(redisPlugin)
  app.register(authPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(authModule, { prefix: '/auth' })
  app.register(adminModule, { prefix: '/admin' })
  app.register(calculatorModule, { prefix: '/calculator' })
  app.register(feasibilityModule, { prefix: '/feasibility' })
  app.register(geographyModule, { prefix: '/geography' })
  app.register(schemeRouterModule, { prefix: '/scheme-router' })
  app.register(groundingModule, { prefix: '/grounding' })
  app.register(notificationModule, { prefix: '/notification' })
  app.register(feedbackModule, { prefix: '/feedback' })
  app.register(accountAggregatorModule, { prefix: '/account-aggregator' })
  app.register(siteCaptureModule, { prefix: '/site-capture' })
  app.register(ussdModule, { prefix: '/ussd' })
  app.register(ledgerModule, { prefix: '/ledger' })
  app.register(creditScoreModule, { prefix: '/credit-score' })
  app.register(advisorSaathiModule, { prefix: '/advisor-saathi' })
  app.register(bankDossierModule, { prefix: '/bank-dossier' })
  app.register(businessTypesModule, { prefix: '/business-types' })
  app.register(bankStatementModule, { prefix: '/bank-statement' })

  return app
}
