export type ApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'more_info'
export type DecisionKind = 'approved' | 'rejected' | 'more_info'

export interface ReportSummary {
  id: string
  applicantId: string
  inputs: Record<string, unknown>
  score: number
  verdictKey: string
  matchedSchemeId: string
  createdAt: string
}

export interface ApplicationRecord {
  id: string
  applicantId: string
  reportId: string
  dossierId: string | null
  districtId: string | null
  blockId: string | null
  status: ApplicationStatus
  assignedOfficerId: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationEvent {
  id: string
  applicationId: string
  actorRole: string
  fromStatus: string | null
  toStatus: string
  note: string | null
  createdAt: string
}

export interface ApplicationDecision {
  id: string
  applicationId: string
  reportId: string
  dossierId: string | null
  officerId: string
  officerName: string
  officerDesignation: string
  decision: DecisionKind
  note: string | null
  signatureHash: string | null
  decidedAt: string
}

export interface PersonSummary {
  id: string
  label: string | null
  designation?: string | null
}

// What every list/detail endpoint returns — the application plus enough
// context to render it, filtered by who is asking (applicantContact is
// only present for the assigned officer/admin; officers never see
// another officer's cases at all).
export interface ApplicationView extends ApplicationRecord {
  report: ReportSummary | null
  location: { stateId: string | null; districtName: string | null; blockName: string | null }
  assignedOfficer: PersonSummary | null
  applicant?: PersonSummary & { phone: string | null; email: string | null }
  events: ApplicationEvent[]
  latestDecision: ApplicationDecision | null
}

export interface CreateApplicationBody {
  reportId: string
}

export interface SubmitApplicationBody {
  // Optional: attach a newer report of the applicant's own when
  // resubmitting after "more info needed"/"rejected".
  reportId?: string
  proprietorName?: string | null
  bankName?: string | null
  note?: string | null
}

export interface ReviseApplicationBody {
  reportId: string
}

export interface DecideBody {
  decision: DecisionKind
  note?: string | null
}

export interface ReassignBody {
  officerId: string
  note?: string | null
}

export interface AdminApplicationFilters {
  status?: string
  unassigned?: string
}

// Public verification — deliberately minimal: whether the hash is ours,
// who approved and when, whether it's still the current approval, and the
// document reference printed next to it (so the bank can match the paper
// in hand). Never the applicant's name, phone, business or financials.
export interface VerifyResult {
  valid: boolean
  officerName?: string
  officerDesignation?: string
  approvedAt?: string
  current?: boolean
  docRef?: string | null
}
