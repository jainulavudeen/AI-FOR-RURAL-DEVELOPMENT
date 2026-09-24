// "Flag this data" -> feedback_flags row, "Request human review" ->
// reports + appeals row, one officer queue read, one status-transition
// write. Dependencies are injected (not imported directly) so the
// round-robin/authorization logic is testable without a live Postgres —
// same pattern as modules/auth/service.ts.
import type { CpgramsAdapter } from './cpgramsAdapter'
import { canApplicantEscalate, isSlaBreached, type EscalationReason } from './escalation'
import type { AuditLogEntryInput } from '../../lib/auditLog'
import type { AppealRequestBody, AppealStatus, FlagRequestBody, UpdateAppealBody } from './types'

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

export class ConflictError extends Error {
  statusCode = 409
  code = 'CONFLICT'
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export function assertOfficer(role: string): void {
  if (role !== 'officer') throw new ForbiddenError('Officer role required')
}

export interface OfficerLoad {
  officerId: string
  openCount: number
}

// Round-robin by current load, not just "the first officer" — an officer
// with zero open appeals is always preferred over one with any.
export function pickOfficerByLoad(loads: OfficerLoad[]): string | null {
  if (loads.length === 0) return null
  return loads.reduce((min, cur) => (cur.openCount < min.openCount ? cur : min)).officerId
}

export interface Appeal {
  id: string
  applicantId: string
  reportId: string | null
  status: AppealStatus
  assignedOfficerId: string | null
  resolutionNote: string | null
  escalatedAt: Date | null
  escalationReason: EscalationReason | null
  cpgramsReferenceId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface QueueItem extends Appeal {
  applicantPhone: string
  report: {
    score: number
    verdictKey: string
    matchedSchemeId: string
    inputs: Record<string, unknown>
  } | null
}

export interface FeedbackDeps {
  insertFeedbackFlag: (input: { applicantId: string } & FlagRequestBody) => Promise<{ id: string }>
  getCurrentSchemeRuleVersion: (schemeId: string) => Promise<{ id: string; version: number } | null>
  insertReport: (input: {
    applicantId: string
    inputs: Record<string, unknown>
    score: number
    verdictKey: string
    matchedSchemeId: string
    schemeRulesVersionId: string
    emiSchedule: unknown
    dataVintage: Record<string, unknown>
  }) => Promise<{ id: string }>
  getOfficerLoads: () => Promise<OfficerLoad[]>
  insertAppeal: (input: { applicantId: string; reportId: string; assignedOfficerId: string | null }) => Promise<Appeal>
  getOfficerQueue: (officerId: string) => Promise<QueueItem[]>
  getAppealById: (appealId: string) => Promise<Appeal | null>
  updateAppeal: (appealId: string, body: UpdateAppealBody) => Promise<Appeal>
  getOpenAppeals: () => Promise<Appeal[]>
  updateAppealEscalation: (
    appealId: string,
    input: { escalatedAt: Date; escalationReason: EscalationReason; cpgramsReferenceId: string }
  ) => Promise<Appeal>
  getApplicantPhone: (applicantId: string) => Promise<string | null>
  cpgrams: CpgramsAdapter
  getReportById: (reportId: string) => Promise<StoredReport | null>
  insertAuditLogEntry: (input: AuditLogEntryInput) => Promise<void>
}

export interface StoredReport {
  id: string
  applicantId: string
  inputs: Record<string, unknown>
  score: number
  verdictKey: string
  matchedSchemeId: string
  schemeRulesVersion: string
  emiSchedule: unknown
  dataVintage: Record<string, unknown>
  createdAt: Date
}

export async function createFlag(deps: FeedbackDeps, applicantId: string, body: FlagRequestBody) {
  return deps.insertFeedbackFlag({ applicantId, ...body })
}

function buildDataVintage(body: AppealRequestBody, schemeVersion: number) {
  return {
    feasibility: 'mock-seeded-random',
    calculator: '@setu/core',
    schemeRules: `${body.matchedSchemeId}@v${schemeVersion}`,
    marginCapitalSource: body.marginCapitalSource ?? 'self_reported',
    generatedAt: new Date().toISOString(),
  }
}

export async function createAppeal(deps: FeedbackDeps, applicantId: string, body: AppealRequestBody): Promise<Appeal> {
  const rule = await deps.getCurrentSchemeRuleVersion(body.matchedSchemeId)
  if (!rule) {
    throw new NotFoundError(`No active scheme_rules row for scheme "${body.matchedSchemeId}"`)
  }

  const report = await deps.insertReport({
    applicantId,
    inputs: body.inputs,
    score: body.score,
    verdictKey: body.verdictKey,
    matchedSchemeId: body.matchedSchemeId,
    schemeRulesVersionId: rule.id,
    emiSchedule: body.emiSchedule,
    dataVintage: buildDataVintage(body, rule.version),
  })

  const loads = await deps.getOfficerLoads()
  const assignedOfficerId = pickOfficerByLoad(loads)

  return deps.insertAppeal({ applicantId, reportId: report.id, assignedOfficerId })
}

// Persists a report WITHOUT filing an appeal or touching officer assignment
// — every completed report an authenticated applicant views, not just the
// marginal/low-score ones that get appealed. Added for the peer-benchmark
// feature (peerBenchmark.ts): without this, `reports` only ever contained
// appealed (mostly low-scoring) reports, which would make "entrepreneurs
// like you" a systematically biased sample rather than a real cross-section.
// Best-effort from the client (see apps/web/src/lib/marketData.js) — never
// blocks rendering, and only ever happens for logged-in applicants, same
// auth boundary as every other "saving" action.
export async function saveReport(deps: FeedbackDeps, applicantId: string, body: AppealRequestBody): Promise<{ id: string }> {
  const rule = await deps.getCurrentSchemeRuleVersion(body.matchedSchemeId)
  if (!rule) {
    throw new NotFoundError(`No active scheme_rules row for scheme "${body.matchedSchemeId}"`)
  }

  return deps.insertReport({
    applicantId,
    inputs: body.inputs,
    score: body.score,
    verdictKey: body.verdictKey,
    matchedSchemeId: body.matchedSchemeId,
    schemeRulesVersionId: rule.id,
    emiSchedule: body.emiSchedule,
    dataVintage: buildDataVintage(body, rule.version),
  })
}

// Returns the exact snapshot stored at insert time — score, matchedSchemeId,
// emiSchedule, schemeRulesVersion never get recomputed against whatever
// scheme_rules is "current" now. This is what makes a report reproducible
// by construction (CLAUDE.md: "a report generated under rule-set vN must
// stay reproducible after vN+1 ships") — there is no code path here (or
// anywhere else in this file) that ever UPDATEs those columns after
// insertReport/saveReport first writes them.
export async function getReportById(
  deps: FeedbackDeps,
  requesterId: string,
  requesterRole: string,
  reportId: string
): Promise<StoredReport> {
  const report = await deps.getReportById(reportId)
  if (!report) throw new NotFoundError('Report not found')
  if (requesterRole !== 'officer' && report.applicantId !== requesterId) {
    throw new ForbiddenError('Cannot view a report you do not own')
  }
  return report
}

export async function getOfficerQueue(deps: FeedbackDeps, officerRole: string, officerId: string): Promise<QueueItem[]> {
  assertOfficer(officerRole)
  return deps.getOfficerQueue(officerId)
}

export async function updateAppealStatus(
  deps: FeedbackDeps,
  officerRole: string,
  officerId: string,
  appealId: string,
  body: UpdateAppealBody
): Promise<Appeal> {
  assertOfficer(officerRole)

  const appeal = await deps.getAppealById(appealId)
  if (!appeal) throw new NotFoundError('Appeal not found')
  if (appeal.assignedOfficerId !== officerId) {
    throw new ForbiddenError('Only the assigned officer may update this appeal')
  }

  const updated = await deps.updateAppeal(appealId, body)
  await deps.insertAuditLogEntry({
    actorId: officerId,
    actorRole: officerRole,
    action: 'appeal_status_update',
    targetType: 'appeal',
    targetId: appealId,
    metadata: { fromStatus: appeal.status, toStatus: body.status },
  })
  return updated
}

// One shared path for both escalation triggers (applicant-initiated and
// SLA-breach sweep) — see escalation.ts for the state-machine rules this
// enforces, and cpgramsAdapter.ts for what actually "escalating to
// CPGRAMS" means today (a mock).
async function escalateAppeal(deps: FeedbackDeps, appeal: Appeal, reason: EscalationReason): Promise<Appeal> {
  if (!canApplicantEscalate(appeal)) {
    throw new ConflictError(`Appeal ${appeal.id} is already in a terminal state ("${appeal.status}") and cannot be escalated`)
  }

  const phone = await deps.getApplicantPhone(appeal.applicantId)
  const filing = await deps.cpgrams.fileGrievance({
    applicantPhone: phone ?? 'unknown',
    subject: `Setu advisory report review — appeal ${appeal.id}`,
    description:
      reason === 'sla_breach'
        ? `No resolution within ${appeal.createdAt.toISOString()} + SLA window — auto-escalated.`
        : 'Applicant requested escalation beyond the internal review queue.',
    reason,
  })

  return deps.updateAppealEscalation(appeal.id, {
    escalatedAt: new Date(filing.filedAt),
    escalationReason: reason,
    cpgramsReferenceId: filing.referenceId,
  })
}

// Applicant-initiated escalation — the applicant escalating their OWN
// still-open appeal. No minimum wait enforced (see escalation.ts's
// canApplicantEscalate comment).
export async function applicantEscalateAppeal(deps: FeedbackDeps, applicantId: string, appealId: string): Promise<Appeal> {
  const appeal = await deps.getAppealById(appealId)
  if (!appeal) throw new NotFoundError('Appeal not found')
  if (appeal.applicantId !== applicantId) {
    throw new ForbiddenError('Only the applicant who filed this appeal may escalate it')
  }
  return escalateAppeal(deps, appeal, 'applicant_requested')
}

// Officer-triggered SLA sweep — scans every open appeal and escalates the
// ones past SLA_BREACH_HOURS. Not wired to any scheduler in this repo (no
// cron/task-queue infra exists here) — exposed as an officer-triggerable
// action instead, which is honest about what's real today: a genuine
// deployment would run this on a timer, not by an officer remembering to
// click a button. See HANDOVER.md.
export async function sweepSlaBreaches(deps: FeedbackDeps, officerRole: string, now: Date = new Date()): Promise<Appeal[]> {
  assertOfficer(officerRole)
  const open = await deps.getOpenAppeals()
  const breached = open.filter((appeal) => isSlaBreached(appeal, now))
  const escalated: Appeal[] = []
  for (const appeal of breached) {
    escalated.push(await escalateAppeal(deps, appeal, 'sla_breach'))
  }
  return escalated
}
