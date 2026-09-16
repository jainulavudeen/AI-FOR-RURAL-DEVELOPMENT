// "Flag this data" -> feedback_flags row, "Request human review" ->
// reports + appeals row, one officer queue read, one status-transition
// write. Dependencies are injected (not imported directly) so the
// round-robin/authorization logic is testable without a live Postgres —
// same pattern as modules/auth/service.ts.
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

  return deps.updateAppeal(appealId, body)
}
