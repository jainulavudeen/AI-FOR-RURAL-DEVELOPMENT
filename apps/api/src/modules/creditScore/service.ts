import { computeCreditScore, summarizeLedger, type CreditScoreResult, type LedgerTransaction } from '@setu/core'

// Reads the same ledger_transactions rows the `ledger` module owns
// directly (a plain function call within one deployable unit, not a
// second copy of ledger's own service — see CLAUDE.md: "no inter-service
// network hops"), then calls the exact same @setu/core functions
// apps/web's client-side simulator calls. This is the server-side audit
// mirror for the score, same relationship `calculator` has to
// packages/core/calculator.ts.
export interface CreditScoreDeps {
  getTransactionsByApplicantId: (applicantId: string) => Promise<LedgerTransaction[]>
}

// vintageYears has no server-side source yet — no schema field persists a
// self-reported business vintage today (that's Shop Profile, a later
// phase). Always 0 here rather than trusting an unverified client-supplied
// number into what's meant to be the authoritative score; the UI surfaces
// this honestly rather than silently.
export async function getCreditScore(deps: CreditScoreDeps, applicantId: string, asOfDate: Date = new Date()): Promise<CreditScoreResult> {
  const transactions = await deps.getTransactionsByApplicantId(applicantId)
  const summary = summarizeLedger(transactions, asOfDate)
  return computeCreditScore({ summary, vintageYears: 0 })
}
