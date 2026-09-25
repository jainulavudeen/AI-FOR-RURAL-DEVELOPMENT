import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import {
  applicants,
  applicationDecisions,
  applicationEvents,
  applications,
  auditLog,
  bankDossiers,
  blocks,
  districts,
  reports,
} from '../../db/schema/index.js'
import type { ApplicantSelection } from '../../lib/financialSnapshot.js'
import { findCoveringOfficerIds, resolveReportLocation } from '../../lib/jurisdiction.js'
import { createBankDossierDeps } from '../bankDossier/deps.js'
import { generateDossier, verifyApprovalHash } from '../bankDossier/service.js'
import {
  OPEN_STATUSES,
  createApplication,
  decide,
  getOne,
  listAssigned,
  listForAdmin,
  listMine,
  reassign,
  reviseApplication,
  startReview,
  submitApplication,
  verifyApproval,
  type ApplicationsDeps,
} from './service.js'
import type {
  AdminApplicationFilters,
  ApplicationDecision,
  ApplicationRecord,
  ApplicationStatus,
  ApplicationView,
  CreateApplicationBody,
  DecideBody,
  ReassignBody,
  ReportSummary,
  ReviseApplicationBody,
  SubmitApplicationBody,
} from './types.js'

function toRecord(row: typeof applications.$inferSelect): ApplicationRecord {
  return {
    id: row.id,
    applicantId: row.applicantId,
    reportId: row.reportId,
    dossierId: row.dossierId,
    districtId: row.districtId,
    blockId: row.blockId,
    status: row.status as ApplicationStatus,
    assignedOfficerId: row.assignedOfficerId,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toDecision(row: typeof applicationDecisions.$inferSelect): ApplicationDecision {
  return {
    id: row.id,
    applicationId: row.applicationId,
    reportId: row.reportId,
    dossierId: row.dossierId,
    officerId: row.officerId,
    officerName: row.officerName,
    officerDesignation: row.officerDesignation,
    decision: row.decision as ApplicationDecision['decision'],
    note: row.note,
    signatureHash: row.signatureHash,
    decidedAt: row.decidedAt.toISOString(),
  }
}

function toReport(row: typeof reports.$inferSelect): ReportSummary {
  return {
    id: row.id,
    applicantId: row.applicantId,
    inputs: row.inputs as Record<string, unknown>,
    score: row.score,
    verdictKey: row.verdictKey,
    matchedSchemeId: row.matchedSchemeId,
    createdAt: row.createdAt.toISOString(),
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// The applicant → officer → verified-dossier flow (see service.ts). Every
// route carries requireRole for its audience; service.ts re-checks
// ownership/assignment on top of that.
const applicationsRoutes: FastifyPluginAsync = async (fastify) => {
  const dossierDeps = createBankDossierDeps(fastify)
  const db = fastify.db

  const deps: ApplicationsDeps = {
    getReport: async (id) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1)
      return row ? toReport(row) : null
    },
    getApplication: async (id) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const [row] = await db.select().from(applications).where(eq(applications.id, id)).limit(1)
      return row ? toRecord(row) : null
    },
    getApplicationByReport: async (applicantId, reportId) => {
      const [row] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.applicantId, applicantId), eq(applications.reportId, reportId)))
        .limit(1)
      return row ? toRecord(row) : null
    },
    insertApplication: async (input) => {
      const [row] = await db.insert(applications).values(input).returning()
      if (!row) throw new Error('Failed to insert application')
      return toRecord(row)
    },
    updateApplication: async (id, patch) => {
      const { submittedAt, updatedAt, ...rest } = patch
      const [row] = await db
        .update(applications)
        .set({
          ...rest,
          ...(submittedAt !== undefined ? { submittedAt: submittedAt ? new Date(submittedAt) : null } : {}),
          updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
        })
        .where(eq(applications.id, id))
        .returning()
      if (!row) throw new Error('Failed to update application')
      return toRecord(row)
    },
    insertEvent: async (input) => {
      await db.insert(applicationEvents).values({
        applicationId: input.applicationId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        note: input.note ?? null,
        metadata: input.metadata ?? null,
      })
    },
    insertDecision: async (input) => {
      const [row] = await db.insert(applicationDecisions).values(input).returning()
      if (!row) throw new Error('Failed to insert decision')
      return toDecision(row)
    },
    getLatestDecision: async (applicationId) => {
      const [row] = await db
        .select()
        .from(applicationDecisions)
        .where(eq(applicationDecisions.applicationId, applicationId))
        .orderBy(desc(applicationDecisions.decidedAt))
        .limit(1)
      return row ? toDecision(row) : null
    },
    getDecisionByHash: async (hash) => {
      const [row] = await db.select().from(applicationDecisions).where(eq(applicationDecisions.signatureHash, hash)).limit(1)
      return row ? toDecision(row) : null
    },
    resolveLocation: (inputs) => resolveReportLocation(db, inputs),
    findCoveringOfficers: async (districtId, blockId) => {
      const covering = await findCoveringOfficerIds(db, districtId, blockId)
      if (covering.length === 0) return []
      const loads = await db
        .select({ officerId: applications.assignedOfficerId, count: sql<number>`count(*)::int` })
        .from(applications)
        .where(
          and(
            inArray(
              applications.assignedOfficerId,
              covering.map((c) => c.officerId)
            ),
            inArray(applications.status, OPEN_STATUSES)
          )
        )
        .groupBy(applications.assignedOfficerId)
      const loadById = new Map(loads.map((l) => [l.officerId, l.count]))
      return covering.map((c) => ({ ...c, openCount: loadById.get(c.officerId) ?? 0 }))
    },
    getOfficerProfile: async (id) => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null
      const [row] = await db
        .select({ id: applicants.id, role: applicants.role, active: applicants.active, displayName: applicants.displayName, designation: applicants.designation })
        .from(applicants)
        .where(eq(applicants.id, id))
        .limit(1)
      return row ?? null
    },
    createDossier: async ({ applicantId, applicationId, report, proprietorName, bankName }) => {
      const inputs = report.inputs
      const dossier = await generateDossier(
        dossierDeps,
        applicantId,
        { selection: inputs as ApplicantSelection, schemeId: report.matchedSchemeId, proprietorName, bankName },
        {
          report: {
            reportId: report.id,
            applicationId,
            score: report.score,
            verdictKey: report.verdictKey,
            matchedSchemeId: report.matchedSchemeId,
            blockId: str(inputs.blockId),
            businessId: str(inputs.businessId),
            margin: typeof inputs.margin === 'number' ? inputs.margin : null,
            reportCreatedAt: report.createdAt,
          },
        }
      )
      return dossier.id
    },
    getDossierDocRef: async (dossierId) => {
      const [row] = await db.select({ snapshot: bankDossiers.snapshot }).from(bankDossiers).where(eq(bankDossiers.id, dossierId)).limit(1)
      return (row?.snapshot as { docRef?: string } | undefined)?.docRef ?? null
    },
    hydrate: async (records, viewer) => {
      if (records.length === 0) return []
      const ids = records.map((r) => r.id)
      const reportIds = [...new Set(records.map((r) => r.reportId))]
      const personIds = [...new Set(records.flatMap((r) => [r.applicantId, r.assignedOfficerId]).filter((x): x is string => Boolean(x)))]
      const districtIds = [...new Set(records.map((r) => r.districtId).filter((x): x is string => Boolean(x)))]
      const blockIds = [...new Set(records.map((r) => r.blockId).filter((x): x is string => Boolean(x)))]

      const [reportRows, eventRows, decisionRows, people, districtRows, blockRows] = await Promise.all([
        db.select().from(reports).where(inArray(reports.id, reportIds)),
        db.select().from(applicationEvents).where(inArray(applicationEvents.applicationId, ids)).orderBy(asc(applicationEvents.createdAt)),
        db.select().from(applicationDecisions).where(inArray(applicationDecisions.applicationId, ids)).orderBy(desc(applicationDecisions.decidedAt)),
        personIds.length
          ? db
              .select({ id: applicants.id, displayName: applicants.displayName, designation: applicants.designation, phone: applicants.phone, email: applicants.email })
              .from(applicants)
              .where(inArray(applicants.id, personIds))
          : Promise.resolve([]),
        districtIds.length ? db.select({ id: districts.id, name: districts.name }).from(districts).where(inArray(districts.id, districtIds)) : Promise.resolve([]),
        blockIds.length ? db.select({ id: blocks.id, name: blocks.name }).from(blocks).where(inArray(blocks.id, blockIds)) : Promise.resolve([]),
      ])
      const reportById = new Map(reportRows.map((r) => [r.id, toReport(r)]))
      const personById = new Map(people.map((p) => [p.id, p]))
      const districtName = new Map(districtRows.map((d) => [d.id, d.name]))
      const blockName = new Map(blockRows.map((b) => [b.id, b.name]))
      // Applicant contact details only go to the people handling the case.
      const showApplicantContact = viewer.role === 'officer' || viewer.role === 'admin'

      return records.map((r): ApplicationView => {
        const report = reportById.get(r.reportId) ?? null
        const officer = r.assignedOfficerId ? personById.get(r.assignedOfficerId) : undefined
        const applicant = personById.get(r.applicantId)
        const latest = decisionRows.find((d) => d.applicationId === r.id)
        return {
          ...r,
          report,
          location: {
            stateId: str(report?.inputs.stateId),
            districtName: (r.districtId && districtName.get(r.districtId)) || str(report?.inputs.districtId),
            blockName: (r.blockId && blockName.get(r.blockId)) || str(report?.inputs.blockId),
          },
          assignedOfficer: officer ? { id: officer.id, label: officer.displayName, designation: officer.designation } : null,
          ...(showApplicantContact && applicant
            ? { applicant: { id: applicant.id, label: applicant.displayName, phone: applicant.phone, email: applicant.email } }
            : {}),
          events: eventRows
            .filter((e) => e.applicationId === r.id)
            .map((e) => ({
              id: e.id,
              applicationId: e.applicationId,
              actorRole: e.actorRole,
              fromStatus: e.fromStatus,
              toStatus: e.toStatus,
              note: e.note,
              createdAt: e.createdAt.toISOString(),
            })),
          latestDecision: latest ? toDecision(latest) : null,
        }
      })
    },
    listByApplicant: async (applicantId) =>
      (await db.select().from(applications).where(eq(applications.applicantId, applicantId)).orderBy(desc(applications.updatedAt))).map(toRecord),
    listByOfficer: async (officerId) =>
      (
        await db
          .select()
          .from(applications)
          .where(eq(applications.assignedOfficerId, officerId))
          .orderBy(sql`case ${applications.status} when 'submitted' then 0 when 'under_review' then 1 when 'more_info' then 2 else 3 end`, asc(applications.submittedAt))
      ).map(toRecord),
    listAll: async ({ status, unassignedOnly }) => {
      const conditions = []
      if (status) conditions.push(eq(applications.status, status))
      if (unassignedOnly) {
        conditions.push(isNull(applications.assignedOfficerId))
        conditions.push(inArray(applications.status, OPEN_STATUSES))
      }
      const rows = await db
        .select()
        .from(applications)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(applications.updatedAt))
        .limit(300)
      return rows.map(toRecord)
    },
    insertAuditLogEntry: async (input) => {
      await db.insert(auditLog).values(input)
    },
  }

  const actor = (request: { user: { sub: string; role: string } }) => ({ id: request.user.sub, role: request.user.role })
  const applicant = { preHandler: [fastify.requireRole('applicant')] }
  const officer = { preHandler: [fastify.requireRole('officer')] }
  const admin = { preHandler: [fastify.requireRole('admin')] }
  const anyRole = { preHandler: [fastify.requireRole('applicant', 'officer', 'admin')] }

  // ── Public: bank verification of a printed Verified Approval ──
  // Returns only valid/officer/designation/time/current/docRef — never
  // anything about the applicant. Also accepts hashes issued by the
  // retired standalone dossier approval.
  fastify.get<{ Params: { hash: string } }>('/verify/:hash', async (request, reply) => {
    const hash = String(request.params.hash ?? '').toLowerCase()
    const result = await verifyApproval(deps, hash)
    if (result) return reply.status(200).send(result)
    const legacy = await verifyApprovalHash(dossierDeps, hash)
    if (!legacy.valid) return reply.status(200).send({ valid: false })
    return reply.status(200).send({
      valid: true,
      officerName: legacy.officerName,
      officerDesignation: legacy.officerDesignation,
      approvedAt: legacy.approvedAt,
      current: legacy.current,
      docRef: null,
    })
  })

  // ── Applicant ──
  fastify.post<{ Body: CreateApplicationBody }>('/', applicant, async (request, reply) => {
    return reply.status(201).send(await createApplication(deps, actor(request), request.body ?? ({} as CreateApplicationBody)))
  })
  fastify.get('/mine', applicant, async (request, reply) => reply.send(await listMine(deps, actor(request))))
  fastify.post<{ Params: { id: string }; Body: SubmitApplicationBody }>('/:id/submit', applicant, async (request, reply) => {
    return reply.send(await submitApplication(deps, actor(request), request.params.id, request.body ?? {}))
  })
  fastify.post<{ Params: { id: string }; Body: ReviseApplicationBody }>('/:id/revise', applicant, async (request, reply) => {
    return reply.send(await reviseApplication(deps, actor(request), request.params.id, request.body ?? ({} as ReviseApplicationBody)))
  })

  // ── Officer ──
  fastify.get('/assigned', officer, async (request, reply) => reply.send(await listAssigned(deps, actor(request))))
  fastify.post<{ Params: { id: string } }>('/:id/start-review', officer, async (request, reply) => {
    return reply.send(await startReview(deps, actor(request), request.params.id))
  })
  fastify.post<{ Params: { id: string }; Body: DecideBody }>('/:id/decision', officer, async (request, reply) => {
    return reply.send(await decide(deps, actor(request), request.params.id, request.body ?? ({} as DecideBody)))
  })

  // ── Admin ──
  fastify.get<{ Querystring: AdminApplicationFilters }>('/', admin, async (request, reply) => {
    return reply.send(await listForAdmin(deps, actor(request), request.query ?? {}))
  })
  fastify.post<{ Params: { id: string }; Body: ReassignBody }>('/:id/reassign', admin, async (request, reply) => {
    return reply.send(await reassign(deps, actor(request), request.params.id, request.body ?? ({} as ReassignBody)))
  })

  // ── Anyone allowed to see it (owner / assigned officer / admin) ──
  fastify.get<{ Params: { id: string } }>('/:id', anyRole, async (request, reply) => {
    return reply.send(await getOne(deps, actor(request), request.params.id))
  })
}

export default applicationsRoutes
