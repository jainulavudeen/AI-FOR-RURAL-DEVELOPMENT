import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import {
  applicants,
  applicationDecisions,
  applications,
  auditLog,
  bankDossierApprovals,
  bankDossiers,
  ledgerTransactions,
} from '../../db/schema/index.js'
import type { BankDossierDeps } from './service.js'
import type { BankDossierRecord, DossierApproval, DossierSnapshot } from './types.js'

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

// Shared by bankDossier's own routes and by modules/applications (which
// freezes a dossier at submit time through the same generateDossier path,
// so there is exactly one way a dossier snapshot gets built).
export function createBankDossierDeps(fastify: FastifyInstance): BankDossierDeps {
  return {
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
    officerCanSeeDossier: async (dossierId, officerId) => {
      const [assigned] = await fastify.db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.dossierId, dossierId), eq(applications.assignedOfficerId, officerId)))
        .limit(1)
      if (assigned) return true
      const [decided] = await fastify.db
        .select({ id: applicationDecisions.id })
        .from(applicationDecisions)
        .where(and(eq(applicationDecisions.dossierId, dossierId), eq(applicationDecisions.officerId, officerId)))
        .limit(1)
      return Boolean(decided)
    },
    getApplicationApproval: async (dossierId) => {
      const [approval] = await fastify.db
        .select()
        .from(applicationDecisions)
        .where(and(eq(applicationDecisions.dossierId, dossierId), eq(applicationDecisions.decision, 'approved')))
        .orderBy(desc(applicationDecisions.decidedAt))
        .limit(1)
      if (!approval?.signatureHash) return null
      const [latest] = await fastify.db
        .select({ id: applicationDecisions.id })
        .from(applicationDecisions)
        .where(eq(applicationDecisions.applicationId, approval.applicationId))
        .orderBy(desc(applicationDecisions.decidedAt))
        .limit(1)
      const [app] = await fastify.db
        .select({ status: applications.status, reportId: applications.reportId, dossierId: applications.dossierId })
        .from(applications)
        .where(eq(applications.id, approval.applicationId))
        .limit(1)
      return {
        officerName: approval.officerName,
        officerDesignation: approval.officerDesignation,
        approvedAt: approval.decidedAt.toISOString(),
        signatureHash: approval.signatureHash,
        current: latest?.id === approval.id && app?.status === 'approved' && app.dossierId === dossierId,
      }
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
}

