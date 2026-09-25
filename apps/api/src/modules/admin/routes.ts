import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { applicants, appeals, applications, auditLog, blocks, districts, officerJurisdictions, reports } from '../../db/schema/index.js'
import {
  inviteOfficer,
  listOfficers,
  setJurisdictions,
  updateOfficer,
  type InviteOfficerBody,
  type OfficerDeps,
  type OfficerJurisdiction,
  type SetJurisdictionsBody,
  type UpdateOfficerBody,
} from './officers.js'
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
      const officerPhoneById = new Map<string, string | null>()
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
      if (filters.targetId) conditions.push(eq(auditLog.targetId, filters.targetId))

      const rows = await fastify.db
        .select({ entry: auditLog, actorName: applicants.displayName, actorPhone: applicants.phone, actorEmail: applicants.email })
        .from(auditLog)
        .leftJoin(applicants, eq(auditLog.actorId, applicants.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.createdAt))
        .limit(200)

      return rows.map(({ entry: row, actorName, actorPhone, actorEmail }) => ({
        id: row.id,
        actorId: row.actorId,
        actorRole: row.actorRole,
        actorLabel: actorName ?? actorPhone ?? actorEmail ?? null,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata as Record<string, unknown> | null,
        createdAt: row.createdAt.toISOString(),
      }))
    },
  }

  const findAccount = async (where: ReturnType<typeof eq>) => {
    const [row] = await fastify.db
      .select({ id: applicants.id, role: applicants.role, phone: applicants.phone, email: applicants.email })
      .from(applicants)
      .where(where)
      .limit(1)
    return row ?? null
  }

  const officerDeps: OfficerDeps = {
    listOfficerViews: async () => {
      const officers = await fastify.db.select().from(applicants).where(eq(applicants.role, 'officer')).orderBy(applicants.createdAt)
      if (officers.length === 0) return []
      const ids = officers.map((o) => o.id)
      const juris = await fastify.db
        .select({
          officerId: officerJurisdictions.officerId,
          districtId: districts.id,
          districtName: districts.name,
          stateCode: districts.stateCode,
          blockId: blocks.id,
          blockName: blocks.name,
        })
        .from(officerJurisdictions)
        .innerJoin(districts, eq(officerJurisdictions.districtId, districts.id))
        .leftJoin(blocks, eq(officerJurisdictions.blockId, blocks.id))
        .where(inArray(officerJurisdictions.officerId, ids))
      const open = await fastify.db
        .select({ officerId: applications.assignedOfficerId, count: sql<number>`count(*)::int` })
        .from(applications)
        .where(and(inArray(applications.assignedOfficerId, ids), inArray(applications.status, ['submitted', 'under_review'])))
        .groupBy(applications.assignedOfficerId)
      const openById = new Map(open.map((o) => [o.officerId, o.count]))

      return officers.map((o) => ({
        id: o.id,
        phone: o.phone,
        email: o.email,
        invitedEmail: o.invitedEmail,
        displayName: o.displayName,
        designation: o.designation,
        active: o.active,
        openApplications: openById.get(o.id) ?? 0,
        jurisdictions: juris
          .filter((j) => j.officerId === o.id)
          .map(
            (j): OfficerJurisdiction => ({
              districtId: j.districtId,
              districtName: j.districtName,
              stateCode: j.stateCode,
              blockId: j.blockId,
              blockName: j.blockName,
            })
          ),
      }))
    },
    findAccountByPhone: (phone) => findAccount(eq(applicants.phone, phone)),
    findAccountByEmail: async (email) =>
      (await findAccount(eq(applicants.email, email))) ?? (await findAccount(eq(applicants.invitedEmail, email))),
    getAccountById: (id) => findAccount(eq(applicants.id, id)),
    upsertOfficer: async (input) => {
      if (input.existingId) {
        await fastify.db
          .update(applicants)
          .set({
            role: 'officer',
            active: true,
            displayName: input.displayName,
            designation: input.designation,
            ...(input.phone ? { phone: input.phone } : {}),
            ...(input.invitedEmail ? { invitedEmail: input.invitedEmail } : {}),
            updatedAt: new Date(),
          })
          .where(eq(applicants.id, input.existingId))
        return input.existingId
      }
      const [row] = await fastify.db
        .insert(applicants)
        .values({
          role: 'officer',
          phone: input.phone,
          invitedEmail: input.invitedEmail,
          displayName: input.displayName,
          designation: input.designation,
        })
        .returning({ id: applicants.id })
      if (!row) throw new Error('Failed to create officer')
      return row.id
    },
    updateOfficer: async (id, patch) => {
      await fastify.db
        .update(applicants)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(applicants.id, id), eq(applicants.role, 'officer')))
    },
    findInvalidJurisdictions: async (entries) => {
      const invalid: number[] = []
      for (const [i, e] of entries.entries()) {
        const uuidLike = /^[0-9a-f-]{36}$/i
        if (!uuidLike.test(e.districtId) || (e.blockId && !uuidLike.test(e.blockId))) {
          invalid.push(i)
          continue
        }
        if (e.blockId) {
          const [row] = await fastify.db
            .select({ id: blocks.id })
            .from(blocks)
            .where(and(eq(blocks.id, e.blockId), eq(blocks.districtId, e.districtId)))
            .limit(1)
          if (!row) invalid.push(i)
        } else {
          const [row] = await fastify.db.select({ id: districts.id }).from(districts).where(eq(districts.id, e.districtId)).limit(1)
          if (!row) invalid.push(i)
        }
      }
      return invalid
    },
    replaceJurisdictions: async (officerId, adminId, entries) => {
      await fastify.db.transaction(async (tx) => {
        await tx.delete(officerJurisdictions).where(eq(officerJurisdictions.officerId, officerId))
        if (entries.length > 0) {
          await tx
            .insert(officerJurisdictions)
            .values(entries.map((e) => ({ officerId, districtId: e.districtId, blockId: e.blockId, createdBy: adminId })))
            .onConflictDoNothing()
        }
      })
    },
    insertAuditLogEntry: deps.insertAuditLogEntry,
  }

  const adminOnly = { preHandler: [fastify.requireRole('admin')] }

  // Officer accounts: list (with jurisdictions + open case load), invite,
  // edit/deactivate, set jurisdictions.
  fastify.get('/officer-accounts', adminOnly, async (request, reply) => {
    return reply.status(200).send(await listOfficers(officerDeps, request.user.role))
  })

  fastify.post<{ Body: InviteOfficerBody }>('/officer-accounts', adminOnly, async (request, reply) => {
    const result = await inviteOfficer(officerDeps, request.user.sub, request.user.role, request.body ?? ({} as InviteOfficerBody))
    return reply.status(201).send(result)
  })

  fastify.patch<{ Params: { id: string }; Body: UpdateOfficerBody }>('/officer-accounts/:id', adminOnly, async (request, reply) => {
    await updateOfficer(officerDeps, request.user.sub, request.user.role, request.params.id, request.body ?? {})
    return reply.status(204).send()
  })

  fastify.put<{ Params: { id: string }; Body: SetJurisdictionsBody }>(
    '/officer-accounts/:id/jurisdictions',
    adminOnly,
    async (request, reply) => {
      await setJurisdictions(officerDeps, request.user.sub, request.user.role, request.params.id, request.body ?? ({} as SetJurisdictionsBody))
      return reply.status(204).send()
    }
  )

  fastify.get('/officers', adminOnly, async (request, reply) => {
    const stats = await getOfficerStats(deps, request.user.role)
    return reply.status(200).send(stats)
  })

  fastify.get<{ Querystring: ReportFilters }>('/reports', adminOnly, async (request, reply) => {
    const reportsList = await getReports(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(reportsList)
  })

  fastify.get<{ Querystring: AppealFilters }>('/appeals', adminOnly, async (request, reply) => {
    const appealsList = await getAppeals(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(appealsList)
  })

  fastify.patch<{ Params: { id: string }; Body: ReassignAppealBody }>(
    '/appeals/:id/reassign',
    adminOnly,
    async (request, reply) => {
      const appeal = await reassignAppeal(deps, request.user.sub, request.user.role, request.params.id, request.body ?? ({} as ReassignAppealBody))
      return reply.status(200).send(appeal)
    }
  )

  fastify.get<{ Querystring: AuditLogFilters }>('/audit-log', adminOnly, async (request, reply) => {
    const entries = await getAuditLog(deps, request.user.role, request.query ?? {})
    return reply.status(200).send(entries)
  })
}

export default adminRoutes
