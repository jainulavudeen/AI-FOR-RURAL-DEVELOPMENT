import { classifyVerdict, clampScore } from './feasibilityBaseline'

// The ONLY way a Google-derived value touches the feasibility score: a
// low-weight, display-time nudge from live competition density. Rules,
// each deliberate:
//   - Low weight: at most -2 points, against ±6..7 for the government-data
//     factors.
//   - Never positive, and zero for a low count: rural Google Maps coverage
//     is patchy, so "few results" may mean "unmapped", not "no
//     competition". Only a genuinely dense result (10+, or the API's 20
//     cap) says anything.
//   - Never changes the verdict band. The nudge is clamped so it can move
//     the score within its band but can never be the reason a business
//     reads as less viable. A verdict always traces to government data.
// Pure and synchronous, like the rest of @setu/core.
export const LIVE_COMPETITION_MAX_PENALTY = 2

export function competitionPenaltyForCount(count: number, capped: boolean): number {
  if (capped || count >= 20) return -2
  if (count >= 10) return -1
  return 0
}

export interface LiveCompetitionAdjustment {
  // the value actually applied (after band clamping), <= 0
  value: number
  // the uncapped penalty the density alone would have implied
  rawValue: number
  // true when the band guard reduced the penalty
  limitedByVerdictGuard: boolean
}

export function liveCompetitionAdjustment(governmentScore: number, count: number, capped: boolean): LiveCompetitionAdjustment {
  const rawValue = competitionPenaltyForCount(count, capped)
  const verdict = classifyVerdict(governmentScore)
  let value = rawValue
  while (value < 0 && classifyVerdict(clampScore(governmentScore + value)) !== verdict) value += 1
  return { value, rawValue, limitedByVerdictGuard: value !== rawValue }
}
