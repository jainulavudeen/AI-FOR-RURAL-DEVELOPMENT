// The "Vikasit Saathi Credit Score" — an explainable alternative-credit
// score built entirely from an applicant's own Bahi-Khata ledger (see
// ledgerSummary.ts), never a bureau pull or a black-box model. Every pillar
// below is a documented, inspectable formula on purpose: the whole point of
// an "explainable" score is that a judge/officer/applicant can see exactly
// why a number came out the way it did, which a opaque ML model would
// undermine even if it scored "better." The weights and targets are
// editorial choices (see each pillar's comment for the reasoning), not a
// figure sourced from a real credit bureau — same honesty posture as
// schemeMatchScore.ts's heuristic ranking.
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts (see
// CLAUDE.md). Imported unforked by both apps/web (the live simulator
// recomputes this on every slider drag) and apps/api (GET
// /credit-score/me) — one scoring function, never two that could drift.
import type { LedgerSummary } from './ledgerSummary'

export const SCORE_MIN = 300
export const SCORE_MAX = 850
export const SCORE_RANGE = SCORE_MAX - SCORE_MIN

// A score at or above this is "Prime Bankable" — chosen to match the
// conventional ~750 threshold Indian bank branch officers already
// associate with priority-sector lending eligibility, so the number means
// something to the person reading it, not just to this app.
export const PRIME_BANKABLE_THRESHOLD = 750

export type CreditScorePillarId = 'loggingRegularity' | 'revenueStability' | 'udhaarHealth' | 'vintageDigital'

// Sums to 100. Logging regularity weighted highest because it's the one
// pillar entirely within an applicant's daily control from day one — the
// other three take time (or capital) to move, so weighting them equally
// highest would make the score feel unmovable to someone just starting out.
export const PILLAR_WEIGHTS: Record<CreditScorePillarId, number> = {
  loggingRegularity: 30,
  revenueStability: 25,
  udhaarHealth: 25,
  vintageDigital: 20,
}

// Editorial targets a pillar's fraction is measured against — each one
// documented at its point of use below, not just here.
const TARGET_ACTIVE_DAYS = 60
const TARGET_TOTAL_SALES = 200000
const TARGET_VINTAGE_YEARS = 5
const TARGET_DIGITAL_SHARE_PERCENT = 50
// A pillar's fraction hits zero once pending udhaar reaches this share of
// total sales — twice the 25% line the readiness checklist (see
// CreditScoreReadinessItem) treats as the safe ceiling, so crossing 25%
// costs real points without being an instant cliff to zero.
const UDHAAR_SHARE_ZERO_POINT = 0.5

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export interface CreditScorePillar {
  id: CreditScorePillarId
  labelKey: string
  weightPercent: number
  pointsEarned: number
  pointsMax: number
  achievedPercent: number
  tipKey: string
}

export type CreditScoreVerdictKey =
  | 'creditScore.verdict.primeBankable'
  | 'creditScore.verdict.bankable'
  | 'creditScore.verdict.building'
  | 'creditScore.verdict.needsWork'

export interface CreditScoreResult {
  score: number
  verdictKey: CreditScoreVerdictKey
  pillars: CreditScorePillar[]
}

export interface CreditScoreInput {
  summary: LedgerSummary
  // Years in trade — self-reported (Shop Profile), not yet asked anywhere
  // in the app today, so this defaults to 0 rather than being guessed.
  // Never fabricate a vintage the applicant hasn't actually told Setu.
  vintageYears?: number
}

export function classifyCreditScoreVerdict(score: number): CreditScoreVerdictKey {
  if (score >= PRIME_BANKABLE_THRESHOLD) return 'creditScore.verdict.primeBankable'
  if (score >= 650) return 'creditScore.verdict.bankable'
  if (score >= 550) return 'creditScore.verdict.building'
  return 'creditScore.verdict.needsWork'
}

// Fraction of "did you log consistently" — active days against a 60-day
// target (the same 60-day figure the Bank Loan Readiness Checklist's
// "Maintain 60+ Days of Digital Bahi-Khata Records" item uses, so the two
// screens never quote different numbers for the same underlying idea).
function loggingRegularityFraction(summary: LedgerSummary): number {
  return clamp01(summary.activeDayCount / TARGET_ACTIVE_DAYS)
}

// Blends raw turnover against a target with month-to-month consistency
// (low variance = stable, not just occasionally busy). A business that
// hits the same target through one huge month and three dead ones is a
// weaker credit story than one that hits it steadily — this rewards the
// latter without needing anything beyond what's already in monthBuckets.
function revenueStabilityFraction(summary: LedgerSummary): number {
  const turnoverFraction = clamp01(summary.totalSales / TARGET_TOTAL_SALES)

  const monthSales = summary.monthBuckets.map((b) => b.sales)
  const mean = monthSales.reduce((a, b) => a + b, 0) / (monthSales.length || 1)
  // No sales visible in the trend window at all (a brand-new or empty
  // ledger, or all activity older than the window) — there's no evidence
  // to call "stable," so this must NOT default to a vacuous 1. Absence of
  // volatility is not the same thing as proven consistency.
  if (mean === 0) return turnoverFraction * 0.6

  const variance = monthSales.reduce((acc, v) => acc + (v - mean) ** 2, 0) / monthSales.length
  const coefficientOfVariation = Math.sqrt(variance) / mean
  const stabilityFraction = clamp01(1 - coefficientOfVariation)

  return 0.6 * turnoverFraction + 0.4 * stabilityFraction
}

// Blends udhaar recovery rate with how large pending udhaar is relative to
// sales — see UDHAAR_SHARE_ZERO_POINT above for the falloff shape. A
// business with real sales and zero udhaar given genuinely has a clean
// udhaar record and should score well here (ledgerSummary.ts's
// udhaarRecoveryRatePercent is 100 "vacuously" in that case, correctly).
// But a ledger with NO sales and NO udhaar at all has nothing to judge —
// that must score 0, not inherit the same vacuous 100.
function udhaarHealthFraction(summary: LedgerSummary): number {
  if (summary.totalSales === 0 && summary.totalUdhaarGiven === 0) return 0

  const udhaarShare = summary.totalSales > 0 ? summary.pendingUdhaar / summary.totalSales : 0
  const shareFraction = clamp01(1 - udhaarShare / UDHAAR_SHARE_ZERO_POINT)
  const recoveryFraction = clamp01(summary.udhaarRecoveryRatePercent / 100)
  return 0.5 * recoveryFraction + 0.5 * shareFraction
}

// Blends self-reported business vintage with digital (UPI) payment share —
// two different signals of "this isn't a fly-by-night operation," neither
// derivable from the ledger's cash-flow numbers alone.
function vintageDigitalFraction(summary: LedgerSummary, vintageYears: number): number {
  const vintageFraction = clamp01(vintageYears / TARGET_VINTAGE_YEARS)
  const digitalFraction = clamp01(summary.digitalSharePercent / TARGET_DIGITAL_SHARE_PERCENT)
  return 0.5 * vintageFraction + 0.5 * digitalFraction
}

const PILLAR_DEFS: Array<{
  id: CreditScorePillarId
  labelKey: string
  tipKey: string
  fraction: (summary: LedgerSummary, vintageYears: number) => number
}> = [
  {
    id: 'loggingRegularity',
    labelKey: 'creditScore.pillar.loggingRegularity',
    tipKey: 'creditScore.tip.loggingRegularity',
    fraction: (summary) => loggingRegularityFraction(summary),
  },
  {
    id: 'revenueStability',
    labelKey: 'creditScore.pillar.revenueStability',
    tipKey: 'creditScore.tip.revenueStability',
    fraction: (summary) => revenueStabilityFraction(summary),
  },
  {
    id: 'udhaarHealth',
    labelKey: 'creditScore.pillar.udhaarHealth',
    tipKey: 'creditScore.tip.udhaarHealth',
    fraction: (summary) => udhaarHealthFraction(summary),
  },
  {
    id: 'vintageDigital',
    labelKey: 'creditScore.pillar.vintageDigital',
    tipKey: 'creditScore.tip.vintageDigital',
    fraction: (summary, vintageYears) => vintageDigitalFraction(summary, vintageYears),
  },
]

export function computeCreditScore(input: CreditScoreInput): CreditScoreResult {
  const vintageYears = input.vintageYears ?? 0

  const pillars: CreditScorePillar[] = PILLAR_DEFS.map((def) => {
    const weightPercent = PILLAR_WEIGHTS[def.id]
    const pointsMax = (weightPercent / 100) * SCORE_RANGE
    const fraction = clamp01(def.fraction(input.summary, vintageYears))
    const pointsEarned = Math.round(fraction * pointsMax)
    return {
      id: def.id,
      labelKey: def.labelKey,
      weightPercent,
      pointsEarned,
      pointsMax: Math.round(pointsMax),
      achievedPercent: Math.round(fraction * 100),
      tipKey: def.tipKey,
    }
  })

  const score = Math.round(SCORE_MIN + pillars.reduce((sum, p) => sum + p.pointsEarned, 0))

  return { score, verdictKey: classifyCreditScoreVerdict(score), pillars }
}

// The Credit Score screen's "Interactive Score Simulator": recomputes the
// same computeCreditScore() against a hypothetical, adjusted summary — the
// exact same function the real score uses, never a separate approximation,
// so a slider's promised point gain can never diverge from what actually
// happens once the applicant logs the real transactions later.
export function simulateScoreDelta(
  input: CreditScoreInput,
  adjustments: { extraActiveDays?: number; extraUdhaarRepaid?: number; targetDigitalSharePercent?: number }
): CreditScoreResult {
  const base = input.summary
  const adjustedSummary: LedgerSummary = {
    ...base,
    activeDayCount: base.activeDayCount + (adjustments.extraActiveDays ?? 0),
    totalUdhaarRepaid: base.totalUdhaarRepaid + (adjustments.extraUdhaarRepaid ?? 0),
    pendingUdhaar: Math.max(0, base.pendingUdhaar - (adjustments.extraUdhaarRepaid ?? 0)),
    udhaarRecoveryRatePercent:
      base.totalUdhaarGiven > 0
        ? Math.min(100, ((base.totalUdhaarRepaid + (adjustments.extraUdhaarRepaid ?? 0)) / base.totalUdhaarGiven) * 100)
        : 100,
    digitalSharePercent:
      adjustments.targetDigitalSharePercent != null
        ? Math.max(base.digitalSharePercent, adjustments.targetDigitalSharePercent)
        : base.digitalSharePercent,
  }

  return computeCreditScore({ summary: adjustedSummary, vintageYears: input.vintageYears })
}
