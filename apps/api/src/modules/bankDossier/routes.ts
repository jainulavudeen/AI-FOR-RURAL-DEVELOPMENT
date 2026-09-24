import { desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import { applicants, auditLog, bankDossierApprovals, bankDossiers, ledgerTransactions } from '../../db/schema/index.js'
import { approveDossier, generateDossier, getDossier, getDossierApprovals, verifyApprovalHash, type BankDossierDeps } from './service.js'
import type { ApproveDossierBody, BankDossierRecord, DossierApproval, DossierSnapshot, GenerateDossierBody } from './types.js'

function rowToRecord(row: typeof bankDossiers.$inferSelect): BankDossierRecord {
  return {
    id: row.id,
    applicantId: row.applicantId,
    schemeId: row.schemeId,
    snapshot: row.snapshot as DossierSnapshot,
    createdAt: row.createdAt.toISOString(),
  }
}

function rowToApproval(row: typeof bankDossierApprovals.$inferSelect): DossierApproval {
  return {
    id: row.id,
    dossierId: row.dossierId,
    officerId: row.officerId,
    officerName: row.officerName,
    officerDesignation: row.officerDesignation,
    signatureHash: row.signatureHash,
    approvedAt: row.approvedAt.toISOString(),
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
    insertApproval: async (input) => {
      const [row] = await fastify.db.insert(bankDossierApprovals).values(input).returning()
      if (!row) throw new Error('Failed to insert dossier approval')
      return rowToApproval(row)
    },
    getApprovalsByDossierId: async (dossierId) => {
      const rows = await fastify.db
        .select()
        .from(bankDossierApprovals)
        .where(eq(bankDossierApprovals.dossierId, dossierId))
        .orderBy(desc(bankDossierApprovals.approvedAt))
      return rows.map(rowToApproval)
    },
    getApprovalByHash: async (hash) => {
      const [row] = await fastify.db.select().from(bankDossierApprovals).where(eq(bankDossierApprovals.signatureHash, hash)).limit(1)
      return row ? rowToApproval(row) : null
    },
    insertAuditLogEntry: async (input) => {
      await fastify.db.insert(auditLog).values(input)
    },
  }

  fastify.post<{ Body: GenerateDossierBody }>('/generate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dossier = await generateDossier(deps, request.user.sub, request.body ?? ({} as GenerateDossierBody))
    return reply.status(201).send(dossier)
  })

  fastify.get<{ Params: { id: string } }>('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dossier = await getDossier(deps, request.user.sub, request.user.role, request.params.id)
    const approvals = await getDossierApprovals(deps, request.user.sub, request.user.role, request.params.id)
    return reply.status(200).send({ ...dossier, latestApproval: approvals[0] ?? null })
  })

  // Officer-only (enforced in the service layer, not just here — never
  // trust a route-level check alone). Every call inserts a fresh approval
  // row; re-approving the same dossier just adds another one on top.
  fastify.post<{ Params: { id: string }; Body: ApproveDossierBody }>(
    '/:id/approve',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const approval = await approveDossier(
        deps,
        request.user.sub,
        request.user.role,
        request.params.id,
        request.body ?? ({} as ApproveDossierBody)
      )
      return reply.status(201).send(approval)
    }
  )

  // Public, unauthenticated — a bank verifying a hash printed on paper has
  // no Setu account. Never returns applicant financial data (types.ts's
  // VerifyApprovalResult).
  fastify.get<{ Params: { hash: string } }>('/verify/:hash', async (request, reply) => {
    const result = await verifyApprovalHash(deps, request.params.hash)
    return reply.status(200).send(result)
  })
}

export default bankDossierRoutes
