import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import { ledgerTransactions } from '../../db/schema/index.js'
import { getCreditScore, type CreditScoreDeps } from './service.js'

// Auth-gated — reads the caller's own ledger only (request.user.sub), same
// "no ownership-mismatch branch needed" posture as the ledger module
// itself: every query here is implicitly "my own data."
const creditScoreRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: CreditScoreDeps = {
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

  fastify.get('/me', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const result = await getCreditScore(deps, request.user.sub)
    return reply.status(200).send(result)
  })
}

export default creditScoreRoutes
