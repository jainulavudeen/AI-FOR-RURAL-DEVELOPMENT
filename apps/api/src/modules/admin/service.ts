import type { AuditLogEntryInput } from '../../lib/auditLog.js'
import type {
  AdminAppealListItem,
  AdminReportListItem,
  AppealFilters,
  AuditLogEntryView,
  AuditLogFilters,
  OfficerStats,
  ReassignAppealBody,
  ReportFilters,
} from './types.js'

export class ForbiddenError extends Error {
  statusCode = 403
  code = 'FORBIDDEN'
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  statusCode = 404
  code = 'NOT_FOUND'
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends Error {
  statusCode = 409
  code = 'CONFLICT'
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

// The one gate every function below goes through — enforced here, not just
// by hiding the Admin Portal's UI (CLAUDE.md item 6's explicit ask). An
// officer's token, correctly, gets exactly the same ForbiddenError an
// applicant's would. (Routes also carry fastify.requireRole('admin'); this
// is the second, service-level layer.)
export function assertAdmin(role: string): void {
  if (role !== 'admin') throw new ForbiddenError('Admin role required')
}

export interface AppealStatRow {
  assignedOfficerId: string
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface AdminDeps {
  listOfficers: () => Promise<Array<{ id: string; phone: string | null }>>
  // Every appeal's officer/status/timestamps, unfiltered — small enough at
  // this scale to aggregate in JS (see getOfficerStats) rather than a
  // hand-rolled SQL aggregation per stat.
  listAppealStatRows: () => Promise<AppealStatRow[]>
  listReports: (filters: ReportFilters) => Promise<AdminReportListItem[]>
  listAppeals: (filters: AppealFilters) => Promise<AdminAppealListItem[]>
  getAppealById: (id: string) => Promise<{ id: string; assignedOfficerId: string | null } | null>
  getApplicantRole: (id: string) => Promise<string | null>
  reassignAppealOfficer: (appealId: string, officerId: string) => Promise<AdminAppealListItem>
  insertAuditLogEntry: (input: AuditLogEntryInput) => Promise<void>
  listAuditLog: (filters: AuditLogFilters) => Promise<AuditLogEntryView[]>
}

const OPEN_STATUSES = new Set(['pending', 'assigned', 'in_review'])
const RESOLUTION_STATUSES = new Set(['resolved', 'rejected'])

// Pending/resolved/rejected counts + average time-to-resolve per officer —
// computed from real appeal rows, not stored/cached, so it's always
// current. Escalated is its own count (not folded into "pending") since
// CPGRAMS escalation is a materially different state, same distinction
// OfficerDashboard's status badges already make.
export async function getOfficerStats(deps: AdminDeps, requesterRole: string): Promise<OfficerStats[]> {
  assertAdmin(requesterRole)
  const [officers, appealRows] = await Promise.all([deps.listOfficers(), deps.listAppealStatRows()])

  return officers.map((officer) => {
    const mine = appealRows.filter((a) => a.assignedOfficerId === officer.id)
    const resolved = mine.filter((a) => RESOLUTION_STATUSES.has(a.status))
    const avgResolutionHours =
      resolved.length === 0
        ? null
        : resolved.reduce((sum, a) => sum + (a.updatedAt.getTime() - a.createdAt.getTime()), 0) / resolved.length / (1000 * 60 * 60)

    return {
      officerId: officer.id,
      phone: officer.phone,
      pendingCount: mine.filter((a) => OPEN_STATUSES.has(a.status)).length,
      resolvedCount: mine.filter((a) => a.status === 'resolved').length,
      rejectedCount: mine.filter((a) => a.status === 'rejected').length,
      escalatedCount: mine.filter((a) => a.status === 'escalated').length,
      avgResolutionHours: avgResolutionHours === null ? null : Math.round(avgResolutionHours * 10) / 10,
    }
  })
}

export async function getReports(deps: AdminDeps, requesterRole: string, filters: ReportFilters): Promise<AdminReportListItem[]> {
  assertAdmin(requesterRole)
  return deps.listReports(filters)
}

export async function getAppeals(deps: AdminDeps, requesterRole: string, filters: AppealFilters): Promise<AdminAppealListItem[]> {
  assertAdmin(requesterRole)
  return deps.listAppeals(filters)
}

// Moves an appeal to a different officer — the only write this whole
// module performs, and it's a routing change, never a status/approval
// decision (CLAUDE.md item 6: "Admins do not approve reports themselves,
// oversight only").
export async function reassignAppeal(
  deps: AdminDeps,
  adminId: string,
  adminRole: string,
  appealId: string,
  body: ReassignAppealBody
): Promise<AdminAppealListItem> {
  assertAdmin(adminRole)
  if (!body.officerId?.trim()) throw new ValidationError('officerId is required')

  const appeal = await deps.getAppealById(appealId)
  if (!appeal) throw new NotFoundError('Appeal not found')

  const targetRole = await deps.getApplicantRole(body.officerId)
  if (targetRole !== 'officer') throw new ValidationError('officerId must belong to a real officer')

  const updated = await deps.reassignAppealOfficer(appealId, body.officerId)
  await deps.insertAuditLogEntry({
    actorId: adminId,
    actorRole: adminRole,
    action: 'appeal_reassigned',
    targetType: 'appeal',
    targetId: appealId,
    metadata: { fromOfficerId: appeal.assignedOfficerId, toOfficerId: body.officerId },
  })
  return updated
}

export async function getAuditLog(deps: AdminDeps, requesterRole: string, filters: AuditLogFilters): Promise<AuditLogEntryView[]> {
  assertAdmin(requesterRole)
  return deps.listAuditLog(filters)
}
