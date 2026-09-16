// applicantId is deliberately absent from every body below — it always
// comes from request.user.sub (the authenticated JWT), never from the
// client. Letting a client supply it would mean anyone could file a
// flag/appeal as anyone else.

export interface FlagRequestBody {
  sourceTable: string
  sourceRowId: string
  reason: string
}

export interface AppealRequestBody {
  inputs: Record<string, unknown>
  score: number
  verdictKey: string
  matchedSchemeId: string
  emiSchedule: unknown
  // Which figure fed the calculator for this report — self-reported (the
  // default, always available) or Account Aggregator-verified (only when
  // the applicant explicitly opted in). Optional so older/simple clients
  // still work; defaults to 'self_reported' server-side.
  marginCapitalSource?: 'self_reported' | 'aa'
}

export type AppealStatus = 'pending' | 'assigned' | 'in_review' | 'resolved' | 'rejected' | 'escalated'

export interface UpdateAppealBody {
  status: AppealStatus
  resolutionNote?: string
}
