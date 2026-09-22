import type { FinancialSnapshot, ApplicantSelection } from '../../lib/financialSnapshot'

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
}

export interface BankDossierRecord {
  id: string
  applicantId: string
  schemeId: string | null
  snapshot: DossierSnapshot
  createdAt: string
}
