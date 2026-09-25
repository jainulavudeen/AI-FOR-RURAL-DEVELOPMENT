import { computeApprovalSignatureHash } from '../../lib/approvalSignature.js'
import type { AuditLogEntryInput } from '../../lib/auditLog.js'
import { pickOfficerForBlock, type CoveringOfficer } from './assignment.js'
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
  VerifyResult,
} from './types.js'

// The applicant → officer → verified-dossier flow. Every function takes
// the requester's id + DB-sourced role and enforces who may do what HERE,
// in addition to the route's requireRole — hiding a button is never the
// access control. Dependencies are injected so the whole state machine is
// tested without Postgres (service.test.ts).

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}
const forbidden = (m: string) => new HttpError(403, 'FORBIDDEN', m)
const notFound = (m: string) => new HttpError(404, 'NOT_FOUND', m)
const conflict = (m: string) => new HttpError(409, 'CONFLICT', m)
const invalid = (m: string) => new HttpError(400, 'BAD_REQUEST', m)

// Which statuses each action may start from. Anything else is a 409 —
// e.g. an officer can't approve a draft, an applicant can't resubmit
// something already under review.
const SUBMITTABLE: ApplicationStatus[] = ['draft', 'rejected', 'more_info']
const REVISABLE: ApplicationStatus[] = ['draft', 'rejected', 'more_info', 'approved']
const DECIDABLE: ApplicationStatus[] = ['submitted', 'under_review']
const REASSIGNABLE: ApplicationStatus[] = ['submitted', 'under_review', 'more_info']
export const OPEN_STATUSES: ApplicationStatus[] = ['submitted', 'under_review']

export interface OfficerProfile {
  id: string
  role: string
  active: boolean
  displayName: string | null
  designation: string | null
}

export interface ApplicationsDeps {
  getReport: (reportId: string) => Promise<ReportSummary | null>
  getApplication: (id: string) => Promise<ApplicationRecord | null>
  getApplicationByReport: (applicantId: string, reportId: string) => Promise<ApplicationRecord | null>
  insertApplication: (input: { applicantId: string; reportId: string }) => Promise<ApplicationRecord>
  updateApplication: (id: string, patch: Partial<Omit<ApplicationRecord, 'id' | 'applicantId' | 'createdAt'>>) => Promise<ApplicationRecord>
  insertEvent: (input: {
    applicationId: string
    actorId: string | null
    actorRole: string
    fromStatus: string | null
    toStatus: string
    note?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
  insertDecision: (input: Omit<ApplicationDecision, 'id' | 'decidedAt'> & { decidedAt: Date }) => Promise<ApplicationDecision>
  getLatestDecision: (applicationId: string) => Promise<ApplicationDecision | null>
  getDecisionByHash: (hash: string) => Promise<ApplicationDecision | null>
  // Resolves the report's (stateId, district name, block name) to real
  // district/block ids. Either may be null if the name isn't in the DB.
  resolveLocation: (inputs: Record<string, unknown>) => Promise<{ districtId: string | null; blockId: string | null }>
  // Active officers covering this block (exact block, or its district),
  // with their current open-case counts, ordered by officer id.
  findCoveringOfficers: (districtId: string, blockId: string | null) => Promise<CoveringOfficer[]>
  getOfficerProfile: (id: string) => Promise<OfficerProfile | null>
  // Freezes a dossier snapshot for this report; returns the new dossier id.
  createDossier: (input: {
    applicantId: string
    applicationId: string
    report: ReportSummary
    proprietorName: string | null
    bankName: string | null
  }) => Promise<string>
  getDossierDocRef: (dossierId: string) => Promise<string | null>
  hydrate: (records: ApplicationRecord[], viewer: { id: string; role: string }) => Promise<ApplicationView[]>
  listByApplicant: (applicantId: string) => Promise<ApplicationRecord[]>
  listByOfficer: (officerId: string) => Promise<ApplicationRecord[]>
  listAll: (filters: { status?: ApplicationStatus; unassignedOnly: boolean }) => Promise<ApplicationRecord[]>
  insertAuditLogEntry: (input: AuditLogEntryInput) => Promise<void>
  now?: () => Date
}

type Actor = { id: string; role: string }

function canView(app: ApplicationRecord, actor: Actor): boolean {
  if (actor.role === 'admin') return true
  if (actor.role === 'officer') return app.assignedOfficerId === actor.id
  return app.applicantId === actor.id
}

async function loadVisible(deps: ApplicationsDeps, actor: Actor, id: string): Promise<ApplicationRecord> {
  const app = await deps.getApplication(id)
  // Same 404 whether it doesn't exist or isn't yours — don't confirm the
  // existence of other people's applications.
  if (!app || !canView(app, actor)) throw notFound('Application not found')
  return app
}

async function transition(
  deps: ApplicationsDeps,
  actor: Actor,
  app: ApplicationRecord,
  patch: Partial<Omit<ApplicationRecord, 'id' | 'applicantId' | 'createdAt'>>,
  event: { action: string; note?: string | null; metadata?: Record<string, unknown> }
): Promise<ApplicationRecord> {
  const now = deps.now?.() ?? new Date()
  const updated = await deps.updateApplication(app.id, { ...patch, updatedAt: now.toISOString() })
  if (patch.status && patch.status !== app.status) {
    await deps.insertEvent({
      applicationId: app.id,
      actorId: actor.id,
      actorRole: actor.role,
      fromStatus: app.status,
      toStatus: patch.status,
      note: event.note ?? null,
      metadata: event.metadata,
    })
  }
  await deps.insertAuditLogEntry({
    actorId: actor.id,
    actorRole: actor.role,
    action: event.action,
    targetType: 'application',
    targetId: app.id,
    metadata: { fromStatus: app.status, toStatus: patch.status ?? app.status, ...(event.note ? { note: event.note } : {}), ...event.metadata },
  })
  return updated
}

// ── Applicant ────────────────────────────────────────────────────────────

// "Save this report as an application" → a draft. Idempotent per report,
// so a double-tap on a slow connection can't create two.
export async function createApplication(deps: ApplicationsDeps, actor: Actor, body: CreateApplicationBody): Promise<ApplicationView> {
  if (actor.role !== 'applicant') throw forbidden('Only applicants create applications')
  if (!body?.reportId) throw invalid('reportId is required')
  const report = await deps.getReport(body.reportId)
  if (!report || report.applicantId !== actor.id) throw notFound('Report not found')

  const existing = await deps.getApplicationByReport(actor.id, report.id)
  if (existing) return (await deps.hydrate([existing], actor))[0]!

  const app = await deps.insertApplication({ applicantId: actor.id, reportId: report.id })
  await deps.insertEvent({ applicationId: app.id, actorId: actor.id, actorRole: actor.role, fromStatus: null, toStatus: 'draft' })
  await deps.insertAuditLogEntry({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'application_created',
    targetType: 'application',
    targetId: app.id,
    metadata: { reportId: report.id },
  })
  return (await deps.hydrate([app], actor))[0]!
}

// Submit (or resubmit after rejected / more info needed). Freezes a fresh
// dossier for exactly the report being submitted, then routes it: a
// resubmission goes back to the officer who asked for more info (if still
// active); otherwise jurisdiction assignment picks one, or the admin's
// unassigned queue gets it.
export async function submitApplication(
  deps: ApplicationsDeps,
  actor: Actor,
  id: string,
  body: SubmitApplicationBody = {}
): Promise<ApplicationView> {
  if (actor.role !== 'applicant') throw forbidden('Only the applicant submits an application')
  const app = await loadVisible(deps, actor, id)
  if (!SUBMITTABLE.includes(app.status)) throw conflict(`An application that is "${app.status}" cannot be submitted`)

  let reportId = app.reportId
  if (body.reportId && body.reportId !== app.reportId) {
    const newer = await deps.getReport(body.reportId)
    if (!newer || newer.applicantId !== actor.id) throw notFound('Report not found')
    reportId = newer.id
  }
  const report = await deps.getReport(reportId)
  if (!report) throw notFound('Report not found')

  const { districtId, blockId } = await deps.resolveLocation(report.inputs)
  const dossierId = await deps.createDossier({
    applicantId: actor.id,
    applicationId: app.id,
    report,
    proprietorName: body.proprietorName?.trim() || null,
    bankName: body.bankName?.trim() || null,
  })

  let officerId: string | null = null
  let routing: 'returned_to_same_officer' | 'jurisdiction' | 'unassigned' = 'unassigned'
  if (app.status !== 'draft' && app.assignedOfficerId) {
    const previous = await deps.getOfficerProfile(app.assignedOfficerId)
    if (previous?.active && previous.role === 'officer') {
      officerId = previous.id
      routing = 'returned_to_same_officer'
    }
  }
  if (!officerId && districtId) {
    officerId = pickOfficerForBlock(await deps.findCoveringOfficers(districtId, blockId))
    if (officerId) routing = 'jurisdiction'
  }

  const now = deps.now?.() ?? new Date()
  const updated = await transition(
    deps,
    actor,
    app,
    { status: 'submitted', reportId, dossierId, districtId, blockId, assignedOfficerId: officerId, submittedAt: now.toISOString() },
    { action: app.status === 'draft' ? 'application_submitted' : 'application_resubmitted', note: body.note ?? null, metadata: { reportId, dossierId } }
  )
  await deps.insertAuditLogEntry({
    actorId: actor.id,
    actorRole: 'system',
    action: officerId ? 'application_assigned' : 'application_unassigned',
    targetType: 'application',
    targetId: app.id,
    metadata: { toOfficerId: officerId, routing, districtId, blockId },
  })
  return (await deps.hydrate([updated], actor))[0]!
}

// Attach a newer report and go back to draft — the only way to "edit"
// after approval. The earlier approval row is untouched and keeps
// verifying, marked superseded (see verifyApproval's `current`).
export async function reviseApplication(
  deps: ApplicationsDeps,
  actor: Actor,
  id: string,
  body: ReviseApplicationBody
): Promise<ApplicationView> {
  if (actor.role !== 'applicant') throw forbidden('Only the applicant revises an application')
  const app = await loadVisible(deps, actor, id)
  if (!REVISABLE.includes(app.status)) throw conflict(`An application that is "${app.status}" cannot be revised right now`)
  if (!body?.reportId) throw invalid('reportId is required')
  const report = await deps.getReport(body.reportId)
  if (!report || report.applicantId !== actor.id) throw notFound('Report not found')

  const updated = await transition(
    deps,
    actor,
    app,
    { status: 'draft', reportId: report.id, dossierId: null },
    { action: 'application_revised', metadata: { fromReportId: app.reportId, toReportId: report.id } }
  )
  return (await deps.hydrate([updated], actor))[0]!
}

export async function listMine(deps: ApplicationsDeps, actor: Actor): Promise<ApplicationView[]> {
  if (actor.role !== 'applicant') throw forbidden('Only applicants have applications')
  return deps.hydrate(await deps.listByApplicant(actor.id), actor)
}

export async function getOne(deps: ApplicationsDeps, actor: Actor, id: string): Promise<ApplicationView> {
  const app = await loadVisible(deps, actor, id)
  return (await deps.hydrate([app], actor))[0]!
}

// ── Officer ──────────────────────────────────────────────────────────────

export async function listAssigned(deps: ApplicationsDeps, actor: Actor): Promise<ApplicationView[]> {
  if (actor.role !== 'officer') throw forbidden('Officer role required')
  return deps.hydrate(await deps.listByOfficer(actor.id), actor)
}

export async function startReview(deps: ApplicationsDeps, actor: Actor, id: string): Promise<ApplicationView> {
  if (actor.role !== 'officer') throw forbidden('Officer role required')
  const app = await loadVisible(deps, actor, id)
  if (app.status === 'under_review') return (await deps.hydrate([app], actor))[0]!
  if (app.status !== 'submitted') throw conflict(`An application that is "${app.status}" cannot be taken under review`)
  const updated = await transition(deps, actor, app, { status: 'under_review' }, { action: 'application_review_started' })
  return (await deps.hydrate([updated], actor))[0]!
}

// Records the officer's decision permanently (a new application_decisions
// row every time — never an update). Name + designation come from the
// officer's admin-managed profile, frozen onto the row. An approval gets
// the Verified Approval hash over (application id, officer id, timestamp,
// server secret).
export async function decide(deps: ApplicationsDeps, actor: Actor, id: string, body: DecideBody): Promise<ApplicationView> {
  if (actor.role !== 'officer') throw forbidden('Only the assigned officer can decide an application')
  const app = await loadVisible(deps, actor, id)
  if (!DECIDABLE.includes(app.status)) throw conflict(`An application that is "${app.status}" cannot be decided`)
  if (!body || !['approved', 'rejected', 'more_info'].includes(body.decision)) {
    throw invalid('decision must be approved, rejected or more_info')
  }
  const note = body.note?.trim() || null
  if (body.decision !== 'approved' && !note) throw invalid('A note for the applicant is required when rejecting or asking for more information')

  const officer = await deps.getOfficerProfile(actor.id)
  if (!officer?.displayName || !officer.designation) {
    throw conflict('Your officer profile has no name/designation yet — ask an admin to set it before recording decisions')
  }
  if (!app.dossierId) throw conflict('This application has no frozen dossier to approve')

  const decidedAt = deps.now?.() ?? new Date()
  const signatureHash = body.decision === 'approved' ? computeApprovalSignatureHash(app.id, actor.id, decidedAt) : null
  const decision = await deps.insertDecision({
    applicationId: app.id,
    reportId: app.reportId,
    dossierId: app.dossierId,
    officerId: actor.id,
    officerName: officer.displayName,
    officerDesignation: officer.designation,
    decision: body.decision,
    note,
    signatureHash,
    decidedAt,
  })
  const updated = await transition(
    deps,
    actor,
    app,
    { status: body.decision },
    { action: `application_${body.decision}`, note, metadata: { decisionId: decision.id, officerName: officer.displayName, officerDesignation: officer.designation } }
  )
  return (await deps.hydrate([updated], actor))[0]!
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function listForAdmin(deps: ApplicationsDeps, actor: Actor, filters: AdminApplicationFilters): Promise<ApplicationView[]> {
  if (actor.role !== 'admin') throw forbidden('Admin role required')
  const status = filters.status as ApplicationStatus | undefined
  if (status && !['draft', 'submitted', 'under_review', 'approved', 'rejected', 'more_info'].includes(status)) {
    throw invalid('Unknown status filter')
  }
  return deps.hydrate(await deps.listAll({ status, unassignedOnly: filters.unassigned === 'true' }), actor)
}

// Admin moves an application to another officer (from the unassigned
// queue, or away from someone). Admins route; they never decide.
export async function reassign(deps: ApplicationsDeps, actor: Actor, id: string, body: ReassignBody): Promise<ApplicationView> {
  if (actor.role !== 'admin') throw forbidden('Admin role required')
  const app = await loadVisible(deps, actor, id)
  if (!REASSIGNABLE.includes(app.status)) throw conflict(`An application that is "${app.status}" cannot be reassigned`)
  if (!body?.officerId) throw invalid('officerId is required')
  const target = await deps.getOfficerProfile(body.officerId)
  if (!target || target.role !== 'officer' || !target.active) throw invalid('officerId must be an active officer')
  if (target.id === app.assignedOfficerId) return (await deps.hydrate([app], actor))[0]!

  // A case moved mid-review goes back to "submitted" so the new officer
  // explicitly starts their own review.
  const status: ApplicationStatus = app.status === 'under_review' ? 'submitted' : app.status
  const updated = await transition(
    deps,
    actor,
    app,
    { assignedOfficerId: target.id, status },
    {
      action: app.assignedOfficerId ? 'application_reassigned' : 'application_assigned',
      note: body.note ?? null,
      metadata: { fromOfficerId: app.assignedOfficerId, toOfficerId: target.id },
    }
  )
  return (await deps.hydrate([updated], actor))[0]!
}

// ── Public ───────────────────────────────────────────────────────────────

// Anyone holding the printed dossier (a bank) can check the hash. `current`
// is false once the application has moved on — revised back to draft, or
// a later decision recorded — so a superseded paper copy says so.
export async function verifyApproval(deps: ApplicationsDeps, hash: string): Promise<VerifyResult | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return { valid: false }
  const decision = await deps.getDecisionByHash(hash)
  if (!decision) return null
  const [app, latest, docRef] = await Promise.all([
    deps.getApplication(decision.applicationId),
    deps.getLatestDecision(decision.applicationId),
    decision.dossierId ? deps.getDossierDocRef(decision.dossierId) : Promise.resolve(null),
  ])
  const current = latest?.id === decision.id && app?.status === 'approved' && app.reportId === decision.reportId
  return {
    valid: true,
    officerName: decision.officerName,
    officerDesignation: decision.officerDesignation,
    approvedAt: decision.decidedAt,
    current,
    docRef,
  }
}
