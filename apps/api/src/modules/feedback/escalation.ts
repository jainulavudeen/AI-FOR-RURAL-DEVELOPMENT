// The escalation state machine: internal queue -> SLA breach OR applicant
// escalation -> CPGRAMS. Pure/synchronous by design (like calculator.ts) so
// the decision logic is trivially testable without touching a clock or a
// database — the only I/O (persisting the transition, calling the CPGRAMS
// adapter) lives in service.ts's escalateAppeal, one level up.
//
//   pending/assigned/in_review ──(SLA breach OR applicant requests)──▶ escalated
//   pending/assigned/in_review ──(officer resolves/rejects)──▶ resolved/rejected
//   resolved/rejected/escalated ──▶ (terminal — no further transitions)

export type EscalationReason = 'sla_breach' | 'applicant_requested'

// 72 hours (3 working days): long enough that a same-day or next-day
// officer response — the common case — never gets needlessly escalated,
// short enough that "Request Human Review" stays meaningful for an
// applicant deciding whether to wait or push for CPGRAMS. Not derived from
// any external SLA standard; a reasonable, documented default that a real
// deployment would tune against actual officer response-time data once it
// exists.
export const SLA_BREACH_HOURS = 72

export interface EscalatableAppeal {
  status: string
  createdAt: Date
}

const TERMINAL_STATUSES = new Set(['resolved', 'rejected', 'escalated'])

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

export function isSlaBreached(appeal: EscalatableAppeal, now: Date = new Date()): boolean {
  if (isTerminal(appeal.status)) return false
  const ageHours = (now.getTime() - appeal.createdAt.getTime()) / (1000 * 60 * 60)
  return ageHours >= SLA_BREACH_HOURS
}

// Applicant-requested escalation is allowed any time the appeal is still
// open — no artificial minimum wait enforced here. A real deployment might
// want to gate this by elapsed time too (e.g. "you can escalate after
// 24h"); not added here since the applicant explicitly asking for
// escalation is itself a meaningful signal worth respecting immediately,
// and adding a second, different waiting-period policy on top of the SLA
// one felt like a decision worth flagging rather than guessing at — see
// HANDOVER.md.
export function canApplicantEscalate(appeal: EscalatableAppeal): boolean {
  return !isTerminal(appeal.status)
}
