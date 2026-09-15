export type ConsentStatus = 'not_requested' | 'pending' | 'active' | 'rejected' | 'revoked' | 'expired'

// Shaped after the real RBI Account Aggregator consent artifact's
// essential fields (FI types, purpose, data date range, fetch type) —
// close enough that a real provider could slot in behind the same
// interface later, even though only a mock exists today.
export interface ConsentScope {
  fiTypes: string[]
  purposeCode: string
  purposeText: string
  dataRangeFrom: string // YYYY-MM-DD
  dataRangeTo: string // YYYY-MM-DD
  fetchType: 'ONETIME' | 'PERIODIC'
}

export interface ConsentRecord {
  consentId: string
  status: ConsentStatus
  scope: ConsentScope
}

export interface FinancialTransaction {
  date: string // YYYY-MM-DD
  amount: number
  type: 'CREDIT' | 'DEBIT'
  narration: string
}

export interface FinancialDataSnapshot {
  accountType: string
  transactions: FinancialTransaction[]
  isMock: true
  fetchedAt: string
}

export interface RequestConsentBody {
  scope: ConsentScope
}

export interface FetchDataBody {
  purpose: string
}
