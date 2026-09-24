import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { applicants, appeals, auditLog, reports } from '../../db/schema/index.js'
import {
  getAppeals,
  getAuditLog,
  getOfficerStats,
  getReports,
  reassignAppeal,
  type AdminDeps,
  type AppealStatRow,
} from './service.js'
import type { AppealFilters, AuditLogFilters, ReassignAppealBody, ReportFilters } from './types.js'

// Admin Portal — oversight only, server-enforced (CLAUDE.md item 6): every
// handler below passes request.user.role straight into the service layer,
// which throws ForbiddenError for anything but 'admin'. An officer's own
// token reaches these exact same handlers and gets the exact same 403 —
// there is no separate, laxer check anywhere for "officer or admin".
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: AdminDeps = {
    listOfficers: async () => {
      const rows = await fastify.db.select({ id: applicants.id, phone: applicants.phone }).from(applicants).where(eq(applicants.role, 'officer'))
      return rows
    },
    listAppealStatRows: async (): Promise<AppealStatRow[]> => {
      const rows = await fastify.db
        .select({ assignedOfficerId: appeals.assignedOfficerId, status: appeals.status, createdAt: appeals.createdAt, updatedAt: appeals.updatedAt })
        .from(appeals)
      return rows
        .filter((r): r is AppealStatRow => r.assignedOfficerId !== null)
        .map((r) => ({ assignedOfficerId: r.assignedOfficerId as string, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt }))
    },
    listReports: async (filters: ReportFilters) => {
      const conditions = []
      if (filters.districtId) conditions.push(sql`${reports.inputs}->>'districtId' = ${filters.districtId}`)
      if (filters.verdictKey) conditions.push(eq(reports.verdictKey, filters.verdictKey))

      const rows = await fastify.db
        .select({ report: reports, applicantPhone: applicants.phone })
        .from(reports)
        .innerJoin(applicants, eq(reports.applicantId, applicants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(reports.createdAt))
        .limit(200)

      return rows.map(({ report, applicantPhone }) => {
        const inputs = report.inputs as Record<string, unknown>
        return {
          id: report.id,
          applicantId: report.applicantId,
          applicantPhone,
          score: report.score,
          verdictKey: report.verdictKey,
          matchedSchemeId: report.matchedSchemeId,
          stateId: typeof inputs.stateId === 'string' ? inputs.stateId : null,
          districtId: typeof inputs.districtId === 'string' ? inputs.districtId : null,
          createdAt: report.createdAt.toISOString(),
        }
      })
    },
    listAppeals: async (filters: AppealFilters) => {
      const conditions = []
      if (filters.districtId) conditions.push(sql`${reports.inputs}->>'districtId' = ${filters.districtId}`)
      if (filters.officerId) conditions.push(eq(appeals.assignedOfficerId, filters.officerId))
      if (filters.status) conditions.push(eq(appeals.status, filters.status))

      const officerApplicants = { id: applicants.id, phone: applicants.phone }
      const rows = await fastify.db
        .select({
          appeal: appeals,
          applicantPhone: applicants.phone,
          report: reports,
        })
        .from(appeals)
        .innerJoin(applicants, eq(appeals.applicantId, applicants.id))
        .leftJoin(reports, eq(appeals.reportId, reports.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(appeals.createdAt))
        .limit(200)

      const officerIds = [...new Set(rows.map((r) => r.appeal.assignedOfficerId).filter((id): id is string => id !== null))]
      const officerPhoneById = new Map<string, string>()
      if (officerIds.length > 0) {
        const officerRows = await fastify.db.select(officerApplicants).from(applicants).where(inArray(applicants.id, officerIds))
        for (const o of officerRows) officerPhoneById.set(o.id, o.phone)
      }

      return rows.map(({ appeal, applicantPhone, report }) => {
        const inputs = (report?.inputs as Record<string, unknown> | undefined) ?? {}
        return {
          id: appeal.id,
          applicantId: appeal.applicantId,
          applicantPhone,
          reportId: appeal.reportId,
          status: appeal.status,
          assignedOfficerId: appeal.assignedOfficerId,
          assignedOfficerPhone: appeal.assignedOfficerId ? (officerPhoneById.get(appeal.assignedOfficerId) ?? null) : null,
          stateId: typeof inputs.stateId === 'string' ? inputs.stateId : null,
          districtId: typeof inputs.districtId === 'string' ? inputs.districtId : null,
          createdAt: appeal.createdAt.toISOString(),
          updatedAt: appeal.updatedAt.toISOString(),
        }
      })
    },
    getAppealById: async (id) => {
      const [row] = await fastify.db.select({ id: appeals.id, assignedOfficerId: appeals.assignedOfficerId }).from(appeals).where(eq(appeals.id, id)).limit(1)
      return row ?? null
    },
    getApplicantRole: async (id) => {
      const [row] = await fastify.db.select({ role: applicants.role }).from(applicants).where(eq(applicants.id, id)).limit(1)
      return row?.role ?? null
    },
    reassignAppealOfficer: async (appealId, officerId) => {
      const [row] = await fastify.db.update(appeals).set({ assignedOfficerId: officerId, updatedAt: new Date() }).where(eq(appeals.id, appealId)).returning()
      if (!row) throw new Error('Failed to reassign appeal')
      const [applicant] = await fastify.db.select({ phone: applicants.phone }).from(applicants).where(eq(applicants.id, row.applicantId)).limit(1)
      const [officer] = await fastify.db.select({ phone: applicants.phone }).from(applicants).where(eq(applicants.id, officerId)).limit(1)
      return {
        id: row.id,
        applicantId: row.applicantId,
        applicantPhone: applicant?.phone ?? '',
        reportId: row.reportId,
        status: row.status,
        assignedOfficerId: row.assignedOfficerId,
        assignedOfficerPhone: officer?.phone ?? null,
        stateId: null,
        districtId: null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    },
    insertAuditLogEntry: async (input) => {
      await fastify.db.insert(auditLog).values(input)
    },
    listAuditLog: async (filters: AuditLogFilters) => {
      const conditions = []
      if (filters.targetType) conditions.push(eq(auditLog.targetType, filters.targetType))
      if (filters.actorId) conditions.push(eq(auditLog.actorId, filters.actorId))

      const rows = await fastify.db
        .select()
        .from(auditLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.createdAt))
        .limit(200)

      return rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorRole: row.actorRole,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata as Record<string, unknown> | null,
        createdAt: row.createdAt.toISOString(),
      }))
    },
  }

  fastify.get('/officers', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const stats = await getOfficerStats(deps, request.user.role)
    return reply.status(200).send(stats)
  })

  fastify.get<{ Querystring: ReportFilters }>('/reports', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const reportsList = await getReports(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(reportsList)
  })

  fastify.get<{ Querystring: AppealFilters }>('/appeals', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const appealsList = await getAppeals(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(appealsList)
  })

  fastify.patch<{ Params: { id: string }; Body: ReassignAppealBody }>(
    '/appeals/:id/reassign',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const appeal = await reassignAppeal(deps, request.user.sub, request.user.role, request.params.id, request.body ?? ({} as ReassignAppealBody))
      return reply.status(200).send(appeal)
    }
  )

  fastify.get<{ Querystring: AuditLogFilters }>('/audit-log', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const entries = await getAuditLog(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(entries)
  })
}

export default adminRoutes
