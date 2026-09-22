import { randomBytes } from 'node:crypto'
import type { LedgerTransaction } from '@setu/core'
import { buildFinancialSnapshot } from '../../lib/financialSnapshot'
import type { BankDossierRecord, DossierSnapshot, GenerateDossierBody } from './types'

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

export interface BankDossierDeps {
  getTransactionsByApplicantId: (applicantId: string) => Promise<LedgerTransaction[]>
  getApplicantPhone: (applicantId: string) => Promise<string | null>
  insertDossier: (input: { applicantId: string; schemeId: string | null; snapshot: DossierSnapshot }) => Promise<BankDossierRecord>
  getDossierById: (id: string) => Promise<BankDossierRecord | null>
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

// A dossier is visible only to the applicant it was generated for — the
// same ownership-check-in-the-service-layer pattern siteCapture/service.ts
// uses, never trusting a caller-supplied applicantId.
export async function getDossier(deps: BankDossierDeps, requesterId: string, id: string): Promise<BankDossierRecord> {
  const dossier = await deps.getDossierById(id)
  if (!dossier) throw new NotFoundError('Dossier not found')
  if (dossier.applicantId !== requesterId) throw new ForbiddenError('Cannot view a dossier you do not own')
  return dossier
}
