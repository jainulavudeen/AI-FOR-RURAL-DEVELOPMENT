import Fastify, { type FastifyInstance } from 'fastify'
import authPlugin from './plugins/auth'
import corsPlugin from './plugins/cors'
import dbPlugin from './plugins/db'
import errorHandlerPlugin from './plugins/errorHandler'
import redisPlugin from './plugins/redis'
import accountAggregatorModule from './modules/accountAggregator'
import authModule from './modules/auth'
import calculatorModule from './modules/calculator'
import creditScoreModule from './modules/creditScore'
import feasibilityModule from './modules/feasibility'
import feedbackModule from './modules/feedback'
import groundingModule from './modules/grounding'
import ledgerModule from './modules/ledger'
import notificationModule from './modules/notification'
import schemeRouterModule from './modules/schemeRouter'
import siteCaptureModule from './modules/siteCapture'
import ussdModule from './modules/ussd'

// One deployable unit — six original modules plus accountAggregator,
// siteCapture, ussd, ledger and now creditScore, deliberate exceptions (see
// CLAUDE.md: consented external data acquisition, geotagged evidence
// capture, a non-smartphone access rail, a daily-use transaction ledger,
// and now an explainable alternative-credit score, none of which
// semantically belong inside any of the original six). Still a modular
// monolith, not microservices — inter-module calls are plain function
// calls with no network hop.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true })

  app.register(errorHandlerPlugin)
  app.register(corsPlugin)
  app.register(dbPlugin)
  app.register(redisPlugin)
  app.register(authPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(authModule, { prefix: '/auth' })
  app.register(calculatorModule, { prefix: '/calculator' })
  app.register(feasibilityModule, { prefix: '/feasibility' })
  app.register(schemeRouterModule, { prefix: '/scheme-router' })
  app.register(groundingModule, { prefix: '/grounding' })
  app.register(notificationModule, { prefix: '/notification' })
  app.register(feedbackModule, { prefix: '/feedback' })
  app.register(accountAggregatorModule, { prefix: '/account-aggregator' })
  app.register(siteCaptureModule, { prefix: '/site-capture' })
  app.register(ussdModule, { prefix: '/ussd' })
  app.register(ledgerModule, { prefix: '/ledger' })
  app.register(creditScoreModule, { prefix: '/credit-score' })

  return app
}
