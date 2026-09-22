import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import { applicants, bankDossiers, ledgerTransactions } from '../../db/schema'
import { generateDossier, getDossier, type BankDossierDeps } from './service'
import type { BankDossierRecord, DossierSnapshot, GenerateDossierBody } from './types'

function rowToRecord(row: typeof bankDossiers.$inferSelect): BankDossierRecord {
  return {
    id: row.id,
    applicantId: row.applicantId,
    schemeId: row.schemeId,
    snapshot: row.snapshot as DossierSnapshot,
    createdAt: row.createdAt.toISOString(),
  }
}

// Auth-gated — a printable financial document is squarely a "saving"
// action, same class as accountAggregator/siteCapture. Generation needs
// connectivity (it assembles a fresh snapshot); viewing an already-
// generated dossier by id is cheap and cacheable — see vite.config.js's
// StaleWhileRevalidate entry on the web side for the offline-reprint story.
const bankDossierRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: BankDossierDeps = {
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
    getApplicantPhone: async (applicantId) => {
      const [row] = await fastify.db.select({ phone: applicants.phone }).from(applicants).where(eq(applicants.id, applicantId)).limit(1)
      return row?.phone ?? null
    },
    insertDossier: async (input) => {
      const [row] = await fastify.db
        .insert(bankDossiers)
        .values({ applicantId: input.applicantId, schemeId: input.schemeId, snapshot: input.snapshot })
        .returning()
      if (!row) throw new Error('Failed to insert bank dossier')
      return rowToRecord(row)
    },
    getDossierById: async (id) => {
      const [row] = await fastify.db.select().from(bankDossiers).where(eq(bankDossiers.id, id)).limit(1)
      return row ? rowToRecord(row) : null
    },
  }

  fastify.post<{ Body: GenerateDossierBody }>('/generate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dossier = await generateDossier(deps, request.user.sub, request.body ?? ({} as GenerateDossierBody))
    return reply.status(201).send(dossier)
  })

  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dossier = await getDossier(deps, request.user.sub, request.params.id)
    return reply.status(200).send(dossier)
  })
}

export default bankDossierRoutes
