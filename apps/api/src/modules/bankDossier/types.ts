import type { FinancialSnapshot, ApplicantSelection } from '../../lib/financialSnapshot.js'

// applicantId is deliberately absent — always request.user.sub, never
// client-supplied. proprietorName/bankName have no persisted source
// anywhere in this app yet (Shop Profile — a later, lower-priority phase
// — would carry them); self-reported here, at generation time, and frozen
// into the snapshot exactly as entered, never fabricated if left blank.
export interface GenerateDossierBody {
  selection?: ApplicantSelection
  schemeId?: string | null
  proprietorName?: string | null
  bankName?: string | null
}

export interface DossierSnapshot {
  docRef: string
  issueDate: string
  applicantPhone: string
  proprietorName: string | null
  bankName: string | null
  businessId: string | null
  stateId: string | null
  districtId: string | null
  schemeId: string | null
  financial: FinancialSnapshot
  // Present on dossiers frozen at application submit: the exact saved
  // report under review (its own numbers came from @setu/core and are
  // immutable in `reports`).
  report?: DossierReportRef
}

export interface DossierReportRef {
  reportId: string
  applicationId: string
  score: number
  verdictKey: string
  matchedSchemeId: string
  blockId: string | null
  businessId: string | null
  margin: number | null
  reportCreatedAt: string
}

// What the dossier page prints in its "Verified Approval" block.
export interface DossierApprovalView {
  officerName: string
  officerDesignation: string
  approvedAt: string
  signatureHash: string
  // false once superseded (application revised or re-decided later).
  current: boolean
}

export interface BankDossierRecord {
  id: string
  applicantId: string
  schemeId: string | null
  snapshot: DossierSnapshot
  createdAt: string
}

export interface DossierApproval {
  id: string
  dossierId: string
  officerId: string
  officerName: string
  officerDesignation: string
  signatureHash: string
  approvedAt: string
}

// What a bank sees from the public verify endpoint — enough to confirm
// authenticity without exposing the applicant's financial data. `current`
// is false when a later approval has superseded this one (re-approval
// inserts a new row rather than overwriting — see the schema's header);
// the hash still verifies as genuine, it's just no longer the latest word.
export interface VerifyApprovalResult {
  valid: boolean
  dossierId?: string
  officerName?: string
  officerDesignation?: string
  approvedAt?: string
  current?: boolean
}
