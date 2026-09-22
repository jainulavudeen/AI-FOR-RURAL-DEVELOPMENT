import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import { ledgerTransactions } from '../../db/schema'
import { chat, type AdvisorSaathiDeps } from './service'
import type { ChatRequestBody } from './types'

// Auth-gated (grounding itself in an applicant's own private ledger data —
// squarely a "saving"-adjacent action, unlike grounding/query's public,
// unauthenticated GET). Reads only the caller's own ledger
// (request.user.sub) — no ownership-mismatch branch needed, same posture
// as ledger/creditScore.
const advisorSaathiRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: AdvisorSaathiDeps = {
    db: fastify.db,
    redis: fastify.redis,
    getTransactionsByApplicantId: async (applicantId): Promise<LedgerTransaction[]> => {
      const rows = await fastify.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.applicantId, applicantId))
      return rows.map((row) => ({
        id: row.id,
        type: row.type as LedgerTransactionType,
        amount: Number(row.amount),
        paymentMode: row.paymentMode as LedgerPaymentMode,
        occurredAt: row.occurredAt,
        customerName: row.customerName,
        source: row.source as LedgerTransactionSource,
      }))
    },
  }

  fastify.post<{ Body: ChatRequestBody }>('/chat', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const result = await chat(deps, request.user.sub, request.body ?? ({} as ChatRequestBody))
    return reply.status(200).send(result)
  })
}

export default advisorSaathiRoutes
