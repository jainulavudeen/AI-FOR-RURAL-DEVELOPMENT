import { desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransactionType } from '@setu/core'
import { ledgerTransactions } from '../../db/schema'
import { getLedgerSummary, listTransactions, recordTransaction, type LedgerDeps } from './service'
import type { CreateTransactionBody, LedgerTransactionRecord } from './types'

function rowToRecord(row: typeof ledgerTransactions.$inferSelect): LedgerTransactionRecord {
  return {
    id: row.id,
    type: row.type as LedgerTransactionType,
    amount: Number(row.amount),
    paymentMode: row.paymentMode as LedgerPaymentMode,
    customerName: row.customerName,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

// Every route here is individually gated behind fastify.authenticate — the
// ledger is squarely a "saving" action (CLAUDE.md's auth boundary), same
// class as accountAggregator/siteCapture/feedback's flag/appeal. A whole
// 8th deliberate module (alongside accountAggregator/siteCapture/ussd),
// not folded into feasibility or feedback: a daily-use transaction ledger
// is a genuinely distinct concern from either.
const ledgerRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: LedgerDeps = {
    insertTransaction: async (input) => {
      // numeric() columns round-trip as strings through drizzle/pg — same
      // convention as schemeRules/informalLendingRates (see those schema
      // files' service-layer Number() reads).
      const [row] = await fastify.db
        .insert(ledgerTransactions)
        .values({ ...input, amount: String(input.amount) })
        .returning()
      if (!row) throw new Error('Failed to insert ledger transaction')
      return rowToRecord(row)
    },
    getTransactionsByApplicantId: async (applicantId) => {
      const rows = await fastify.db
        .select()
        .from(ledgerTransactions)
        .where(eq(ledgerTransactions.applicantId, applicantId))
        .orderBy(desc(ledgerTransactions.occurredAt))
      return rows.map(rowToRecord)
    },
  }

  fastify.post<{ Body: CreateTransactionBody }>('/transactions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const txn = await recordTransaction(deps, request.user.sub, request.body ?? ({} as CreateTransactionBody))
    return reply.status(201).send(txn)
  })

  fastify.get('/transactions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const txns = await listTransactions(deps, request.user.sub)
    return reply.status(200).send(txns)
  })

  fastify.get('/summary', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const summary = await getLedgerSummary(deps, request.user.sub)
    return reply.status(200).send(summary)
  })
}

export default ledgerRoutes
