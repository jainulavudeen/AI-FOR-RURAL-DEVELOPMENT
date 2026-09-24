import { randomBytes } from 'node:crypto'
import type { LedgerTransaction } from '@setu/core'
import { buildFinancialSnapshot } from '../../lib/financialSnapshot.js'
import { computeApprovalSignatureHash } from '../../lib/approvalSignature.js'
import type { AuditLogEntryInput } from '../../lib/auditLog.js'
import type {
  ApproveDossierBody,
  BankDossierRecord,
  DossierApproval,
  DossierSnapshot,
  GenerateDossierBody,
  VerifyApprovalResult,
} from './types.js'

export class NotFoundError extends Error {
  statusCode = 404
  code = 'NOT_FOUND'
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ForbiddenError extends Error {
  statusCode = 403
  code = 'FORBIDDEN'
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
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

export interface BankDossierDeps {
  getTransactionsByApplicantId: (applicantId: string) => Promise<LedgerTransaction[]>
  getApplicantPhone: (applicantId: string) => Promise<string | null>
  insertDossier: (input: { applicantId: string; schemeId: string | null; snapshot: DossierSnapshot }) => Promise<BankDossierRecord>
  getDossierById: (id: string) => Promise<BankDossierRecord | null>
  insertApproval: (input: {
    dossierId: string
    officerId: string
    officerName: string
    officerDesignation: string
    signatureHash: string
    approvedAt: Date
  }) => Promise<DossierApproval>
  // Ordered newest-first — [0] is always "current" (see the schema's
  // header on why re-approval inserts rather than overwrites).
  getApprovalsByDossierId: (dossierId: string) => Promise<DossierApproval[]>
  getApprovalByHash: (hash: string) => Promise<DossierApproval | null>
  insertAuditLogEntry: (input: AuditLogEntryInput) => Promise<void>
}

// A short, human-checkable reference — not a cryptographic verification
// token (a real QR-based authentication block is a flagged nice-to-have,
// not built here; see this module's header). "VS" for Vikasit Saathi/Setu.
function generateDocRef(): string {
  return `VS-${randomBytes(4).toString('hex').toUpperCase()}`
}

// Generates a fresh dossier snapshot and inserts it — immutable from this
// point on (no update route exists). See financialSnapshot.ts's header for
// why `selection` is necessarily caller-supplied (no server-side wizard
// persistence exists); proprietorName/bankName are self-reported the same
// way, frozen exactly as entered, honestly blank if the applicant left
// them empty rather than fabricated.
export async function generateDossier(
  deps: BankDossierDeps,
  applicantId: string,
  body: GenerateDossierBody
): Promise<BankDossierRecord> {
  const [phone, transactions] = await Promise.all([
    deps.getApplicantPhone(applicantId),
    deps.getTransactionsByApplicantId(applicantId),
  ])

  const selection = body.selection ?? {}
  const financial = buildFinancialSnapshot(transactions, selection)

  const snapshot: DossierSnapshot = {
    docRef: generateDocRef(),
    issueDate: new Date().toISOString(),
    applicantPhone: phone ?? '',
    proprietorName: body.proprietorName?.trim() || null,
    bankName: body.bankName?.trim() || null,
    businessId: selection.businessId ?? null,
    stateId: selection.stateId ?? null,
    districtId: selection.districtId ?? null,
    schemeId: body.schemeId ?? null,
    financial,
  }

  return deps.insertDossier({ applicantId, schemeId: body.schemeId ?? null, snapshot })
}

// A dossier is visible to the applicant it was generated for, or to any
// officer (who needs to review it to decide on approval) — same
// role-bypass shape as feedback/service.ts's getReportById. Never trusts
// a caller-supplied applicantId.
export async function getDossier(
  deps: BankDossierDeps,
  requesterId: string,
  requesterRole: string,
  id: string
): Promise<BankDossierRecord> {
  const dossier = await deps.getDossierById(id)
  if (!dossier) throw new NotFoundError('Dossier not found')
  if (requesterRole !== 'officer' && dossier.applicantId !== requesterId) {
    throw new ForbiddenError('Cannot view a dossier you do not own')
  }
  return dossier
}

// Records a NEW approval row — never edits an existing one, so a
// previously-printed signature hash keeps verifying against the exact
// record it was issued from even after a later re-approval supersedes it.
// Only an officer may approve (never an admin — CLAUDE.md item 6:
// "Admins do not approve reports themselves, oversight only").
export async function approveDossier(
  deps: BankDossierDeps,
  officerId: string,
  officerRole: string,
  dossierId: string,
  body: ApproveDossierBody
): Promise<DossierApproval> {
  if (officerRole !== 'officer') throw new ForbiddenError('Only an officer may approve a dossier')
  if (!body.officerName?.trim() || !body.officerDesignation?.trim()) {
    throw new ValidationError('officerName and officerDesignation are required')
  }

  const dossier = await deps.getDossierById(dossierId)
  if (!dossier) throw new NotFoundError('Dossier not found')

  const approvedAt = new Date()
  const signatureHash = computeApprovalSignatureHash(dossierId, officerId, approvedAt)

  const approval = await deps.insertApproval({
    dossierId,
    officerId,
    officerName: body.officerName.trim(),
    officerDesignation: body.officerDesignation.trim(),
    signatureHash,
    approvedAt,
  })
  await deps.insertAuditLogEntry({
    actorId: officerId,
    actorRole: officerRole,
    action: 'dossier_approval',
    targetType: 'bank_dossier',
    targetId: dossierId,
    metadata: { officerName: approval.officerName, officerDesignation: approval.officerDesignation },
  })
  return approval
}

// The full approval history for one dossier, newest first — an officer or
// the owning applicant may see it (same visibility rule as getDossier).
export async function getDossierApprovals(
  deps: BankDossierDeps,
  requesterId: string,
  requesterRole: string,
  dossierId: string
): Promise<DossierApproval[]> {
  await getDossier(deps, requesterId, requesterRole, dossierId) // enforces the ownership/officer check, throws if not found/forbidden
  return deps.getApprovalsByDossierId(dossierId)
}

// Public, unauthenticated — a bank checking a hash printed on paper has no
// Setu login. Deliberately returns only enough to confirm authenticity
// (officer name/designation, when, and whether it's still current), never
// the applicant's financial data.
export async function verifyApprovalHash(deps: BankDossierDeps, hash: string): Promise<VerifyApprovalResult> {
  const approval = await deps.getApprovalByHash(hash)
  if (!approval) return { valid: false }

  const history = await deps.getApprovalsByDossierId(approval.dossierId)
  const current = history[0]?.id === approval.id

  return {
    valid: true,
    dossierId: approval.dossierId,
    officerName: approval.officerName,
    officerDesignation: approval.officerDesignation,
    approvedAt: approval.approvedAt,
    current,
  }
}
