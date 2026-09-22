import {
  computeCreditScore,
  computeMatchScore,
  getEligibleSchemes,
  getLoanSanctionProbabilities,
  getUpcomingFestivals,
  structureFinance,
  summarizeLedger,
  type CreditScoreResult,
  type EligibleScheme,
  type LedgerSummary,
  type LedgerTransaction,
  type LoanSanctionProbability,
  type UpcomingFestival,
} from '@setu/core'

// Assembles everything Setu knows about one applicant into a single
// snapshot — shared by advisorSaathi (grounds chat answers) and bankDossier
// (freezes a point-in-time copy for the printed document), so the two
// screens can never quote different figures for the same applicant at the
// same moment. Pure composition of existing @setu/core functions — this
// file computes nothing itself (CLAUDE.md boundary rule 1: the calculator
// and its siblings stay the single source of truth, never reimplemented).
//
// The ledger transactions come from the DB (authoritative — request.user.sub
// scoped, can't be spoofed). The wizard `selection` fields (business/
// location/category/margin) have no server-side persistence anywhere in
// this app yet — apps/web's AppDataContext is client-only — so they're
// necessarily caller-supplied here, same trust boundary
// SchemeComparison.jsx's own client-side eligibility check already has.
// This snapshot never uses them for anything financial (no rupee figure
// is derived from an unverified selection) — only for scheme/festival
// routing, which is advisory, not a number the LLM could misuse.
export interface ApplicantSelection {
  businessId?: string | null
  stateId?: string | null
  districtId?: string | null
  categoryId?: string | null
  isWomanOwned?: boolean
  margin?: number
}

export interface FinancialSnapshot {
  summary: LedgerSummary
  creditScore: CreditScoreResult
  eligibleSchemes: EligibleScheme[]
  topMatches: Array<{ scheme: EligibleScheme; matchScore: number }>
  loanSanctionProbabilities: LoanSanctionProbability[]
  upcomingFestivals: UpcomingFestival[]
  asOfDate: string
}

const DEFAULT_MARGIN = 20000 // mirrors apps/web's AppDataContext DEFAULT_SELECTION.margin
const TOP_MATCH_COUNT = 3

export function buildFinancialSnapshot(
  transactions: LedgerTransaction[],
  selection: ApplicantSelection,
  asOfDate: Date = new Date()
): FinancialSnapshot {
  const summary = summarizeLedger(transactions, asOfDate)
  const creditScore = computeCreditScore({ summary, vintageYears: 0 })

  const finance = structureFinance(selection.margin ?? DEFAULT_MARGIN)
  const eligibleSchemes = getEligibleSchemes({
    projectCost: finance.projectCost,
    categoryId: selection.categoryId ?? null,
    isWomanOwned: selection.isWomanOwned ?? false,
    stateId: selection.stateId ?? null,
  })

  const topMatches = eligibleSchemes
    .filter((s) => s.eligible)
    .map((scheme) => ({ scheme, matchScore: computeMatchScore(scheme, finance.projectCost) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, TOP_MATCH_COUNT)

  const loanSanctionProbabilities = getLoanSanctionProbabilities(eligibleSchemes, creditScore.score)
  const upcomingFestivals = getUpcomingFestivals(asOfDate, selection.stateId ?? null, selection.businessId ?? null, 75)

  return {
    summary,
    creditScore,
    eligibleSchemes,
    topMatches,
    loanSanctionProbabilities,
    upcomingFestivals,
    asOfDate: asOfDate.toISOString(),
  }
}
