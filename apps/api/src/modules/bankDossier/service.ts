import { randomBytes } from 'node:crypto'
import type { LedgerTransaction } from '@setu/core'
import { buildFinancialSnapshot } from '../../lib/financialSnapshot.js'
import type { AuditLogEntryInput } from '../../lib/auditLog.js'
import type {
  BankDossierRecord,
  DossierApproval,
  DossierApprovalView,
  DossierReportRef,
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
  // An officer may open a dossier only if it belongs to an application
  // currently assigned to them (or one they decided). Never "any officer".
  officerCanSeeDossier: (dossierId: string, officerId: string) => Promise<boolean>
  // The Verified Approval recorded through the applications flow for this
  // exact dossier, if any (see modules/applications).
  getApplicationApproval: (dossierId: string) => Promise<DossierApprovalView | null>
  // LEGACY: approvals recorded by the retired standalone
  // POST /bank-dossier/:id/approve. Kept read-only so any dossier already
  // printed with one of these hashes still verifies. Newest first.
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
// `extras.report` is set only server-side (applications' submit) — never
// read from a request body — so the frozen snapshot records exactly which
// saved report the officer is approving.
export async function generateDossier(
  deps: BankDossierDeps,
  applicantId: string,
  body: GenerateDossierBody,
  extras: { report?: DossierReportRef } = {}
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
    ...(extras.report ? { report: extras.report } : {}),
  }

  return deps.insertDossier({ applicantId, schemeId: body.schemeId ?? null, snapshot })
}

// Visible to its own applicant, any admin, or an officer who has (or had)
// its application assigned. Never trusts a caller-supplied applicantId.
export async function getDossier(
  deps: BankDossierDeps,
  requesterId: string,
  requesterRole: string,
  id: string
): Promise<BankDossierRecord> {
  const dossier = await deps.getDossierById(id)
  if (!dossier) throw new NotFoundError('Dossier not found')
  if (dossier.applicantId === requesterId || requesterRole === 'admin') return dossier
  if (requesterRole === 'officer' && (await deps.officerCanSeeDossier(id, requesterId))) return dossier
  throw new ForbiddenError('Cannot view this dossier')
}

// The approval block to print for this dossier: the applications-flow
// Verified Approval if one exists, else a legacy standalone approval, else
// null (the page then prints "Pending review", never a blank).
export async function getDossierApproval(
  deps: BankDossierDeps,
  requesterId: string,
  requesterRole: string,
  dossierId: string
): Promise<DossierApprovalView | null> {
  await getDossier(deps, requesterId, requesterRole, dossierId) // visibility check; throws if not allowed
  const fromApplication = await deps.getApplicationApproval(dossierId)
  if (fromApplication) return fromApplication
  const [legacy] = await deps.getApprovalsByDossierId(dossierId)
  if (!legacy) return null
  return {
    officerName: legacy.officerName,
    officerDesignation: legacy.officerDesignation,
    approvedAt: legacy.approvedAt,
    signatureHash: legacy.signatureHash,
    current: true,
  }
}

// LEGACY verification for hashes issued by the retired standalone approve
// route; new hashes are verified by modules/applications' verifyApproval
// (the public GET /applications/verify/:hash tries that first, then this).
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
