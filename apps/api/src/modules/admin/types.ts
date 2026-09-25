// Oversight-only role, above officer (CLAUDE.md item 6). Admins never
// approve/resolve anything themselves — every function in service.ts is
// read-only or a reassignment, never a status/approval write.

export interface OfficerStats {
  officerId: string
  phone: string | null
  pendingCount: number
  resolvedCount: number
  rejectedCount: number
  escalatedCount: number
  // null, not 0, when the officer has never resolved/rejected an appeal —
  // an honest "no data yet" rather than a misleading fast average.
  avgResolutionHours: number | null
}

export interface AdminReportListItem {
  id: string
  applicantId: string
  applicantPhone: string | null
  score: number
  verdictKey: string
  matchedSchemeId: string
  stateId: string | null
  districtId: string | null
  createdAt: string
}

export interface ReportFilters {
  districtId?: string
  verdictKey?: string
}

export interface AdminAppealListItem {
  id: string
  applicantId: string
  applicantPhone: string | null
  reportId: string | null
  status: string
  assignedOfficerId: string | null
  assignedOfficerPhone: string | null
  stateId: string | null
  districtId: string | null
  createdAt: string
  updatedAt: string
}

export interface AppealFilters {
  districtId?: string
  officerId?: string
  status?: string
}

export interface ReassignAppealBody {
  officerId: string
}

export interface AuditLogEntryView {
  id: string
  actorId: string
  actorRole: string
  // Display name / phone / email of the actor, whichever exists.
  actorLabel?: string | null
  action: string
  targetType: string
  targetId: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface AuditLogFilters {
  targetType?: string
  actorId?: string
  targetId?: string
}
