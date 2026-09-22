// "How likely is a matched scheme to actually get sanctioned at this
// credit score" — deliberately layered on top of eligibility.ts's
// getEligibleSchemes() output, never a separate eligibility re-derivation.
// A scheme that isn't eligible in the first place never gets a probability
// here; this only ranks confidence among schemes the applicant already
// qualifies for.
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts. The
// percent is a smooth, explainable linear mapping from score to
// probability (documented below), an editorial simplification like
// schemeMatchScore.ts's ranking, not a real underwriting model.
import type { EligibleScheme } from './eligibility'

const PROBABILITY_FLOOR = 5
const PROBABILITY_CEILING = 99
// Below this score, probability floors out at PROBABILITY_FLOOR — deliberately
// not 0, since "very unlikely" is still not "certainly rejected," and Setu
// has no authority to declare a rejection the lender hasn't actually made.
const SCORE_FLOOR_FOR_PROBABILITY = 550
const SCORE_CEILING_FOR_PROBABILITY = 850

export type LoanSanctionProbabilityLabelKey =
  | 'loanSanction.veryHigh'
  | 'loanSanction.high'
  | 'loanSanction.moderate'
  | 'loanSanction.low'
  | 'loanSanction.checkManually'

export interface LoanSanctionProbability {
  schemeId: string
  nameKey: string
  // Null only for a national scheme whose real eligibility gate Setu can't
  // verify (see eligibility.ts's needsManualCheck) — showing a numeric
  // probability there would imply a confidence Setu doesn't actually have.
  probabilityPercent: number | null
  labelKey: LoanSanctionProbabilityLabelKey
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function probabilityPercentForScore(score: number): number {
  const fraction = clamp01((score - SCORE_FLOOR_FOR_PROBABILITY) / (SCORE_CEILING_FOR_PROBABILITY - SCORE_FLOOR_FOR_PROBABILITY))
  return Math.round(PROBABILITY_FLOOR + fraction * (PROBABILITY_CEILING - PROBABILITY_FLOOR))
}

function labelForPercent(percent: number): LoanSanctionProbabilityLabelKey {
  if (percent >= 90) return 'loanSanction.veryHigh'
  if (percent >= 70) return 'loanSanction.high'
  if (percent >= 40) return 'loanSanction.moderate'
  return 'loanSanction.low'
}

export function getLoanSanctionProbabilities(eligibleSchemes: EligibleScheme[], score: number): LoanSanctionProbability[] {
  const percent = probabilityPercentForScore(score)
  const label = labelForPercent(percent)

  // Includes needsManualCheck national schemes alongside strictly eligible
  // ones — excluding them here (the way the /schemes "matched" tab does)
  // would silently drop schemes like PM SVANidhi from this list just
  // because Setu can't verify their real gate; showing them with an
  // explicit "check manually" probability is more honest than omitting
  // them entirely.
  return eligibleSchemes
    .filter((s) => s.eligible || (s.kind === 'national' && s.needsManualCheck))
    .map((s) => {
      const unverified = s.kind === 'national' && s.needsManualCheck
      return {
        schemeId: s.id,
        nameKey: s.nameKey,
        probabilityPercent: unverified ? null : percent,
        labelKey: unverified ? 'loanSanction.checkManually' : label,
      }
    })
}
