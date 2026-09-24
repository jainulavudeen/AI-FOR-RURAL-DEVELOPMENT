import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from './plugins/auth'
import corsPlugin from './plugins/cors'
import dbPlugin from './plugins/db'
import errorHandlerPlugin from './plugins/errorHandler'
import redisPlugin from './plugins/redis'
import accountAggregatorModule from './modules/accountAggregator'
import adminModule from './modules/admin'
import advisorSaathiModule from './modules/advisorSaathi'
import authModule from './modules/auth'
import bankDossierModule from './modules/bankDossier'
import bankStatementModule from './modules/bankStatement'
import businessTypesModule from './modules/businessTypes'
import calculatorModule from './modules/calculator'
import creditScoreModule from './modules/creditScore'
import feasibilityModule from './modules/feasibility'
import feedbackModule from './modules/feedback'
import geographyModule from './modules/geography'
import groundingModule from './modules/grounding'
import ledgerModule from './modules/ledger'
import notificationModule from './modules/notification'
import schemeRouterModule from './modules/schemeRouter'
import siteCaptureModule from './modules/siteCapture'
import ussdModule from './modules/ussd'

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
