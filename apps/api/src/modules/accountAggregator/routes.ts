import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { aaFetchLog, applicants } from '../../db/schema/index.js'
import { createAccountAggregatorProvider } from './provider.js'
import { fetchAndDeriveMargin, getConsentStatus, requestConsent, type AccountAggregatorDeps } from './service.js'
import type { FetchDataBody, RequestConsentBody } from './types.js'

// All routes here are gated behind fastify.authenticate — this is
// squarely a "saving" action (CLAUDE.md: auth gates saving, appealing,
// notifications, never the deterministic calculator). Self-reported
// margin capital stays the default with zero precondition; nothing here
// is reachable without an explicit opt-in request first.
const accountAggregatorRoutes: FastifyPluginAsync = async (fastify) => {
  const provider = createAccountAggregatorProvider()

  const deps: AccountAggregatorDeps = {
    provider,
    updateApplicantConsent: async (applicantId, consent) => {
      await fastify.db
        .update(applicants)
        .set({
          aaConsentId: consent.consentId,
          aaConsentStatus: consent.status,
          aaConsentScope: consent.scope,
          aaConsentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(applicants.id, applicantId))
    },
    writeFetchLog: async (input) => {
      await fastify.db.insert(aaFetchLog).values({
        applicantId: input.applicantId,
        consentId: input.consentId,
        purpose: input.purpose,
        status: input.status,
        recordCount: input.recordCount,
        requestedAt: input.requestedAt,
        respondedAt: input.respondedAt,
        errorMessage: input.errorMessage,
      })
    },
  }

  fastify.post<{ Body: RequestConsentBody }>('/consent', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const { scope } = request.body ?? {}
    if (!scope || !Array.isArray(scope.fiTypes) || scope.fiTypes.length === 0) {
      return reply.status(400).send({ error: { message: 'scope.fiTypes is required', code: 'BAD_REQUEST' } })
    }
    const consent = await requestConsent(deps, request.user.sub, scope)
    return reply.status(201).send(consent)
  })

  fastify.get<{ Params: { id: string } }>('/consent/:id', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const status = await getConsentStatus(deps, request.user.sub, request.params.id)
    return reply.status(200).send({ consentId: request.params.id, status })
  })

  fastify.post<{ Params: { id: string }; Body: FetchDataBody }>(
    '/consent/:id/fetch',
    { preHandler: [fastify.requireRole('applicant')] },
    async (request, reply) => {
      const purpose = request.body?.purpose
      if (!purpose) {
        return reply.status(400).send({ error: { message: 'purpose is required', code: 'BAD_REQUEST' } })
      }
      const result = await fetchAndDeriveMargin(deps, request.user.sub, request.params.id, { purpose })
      return reply.status(200).send(result)
    }
  )
}

export default accountAggregatorRoutes
