// Shared, non-financial feasibility-score constants. Not the calculator
// (rule 1 of CLAUDE.md's boundary doesn't apply here — nothing here is a
// rupee figure), but sharing it stops apps/web's offline-first seeded mock
// and apps/api's real data-backed assembly from silently drifting apart:
// both need the same business-type baseline and the same verdict ladder to
// produce comparable scores.

export const BASE_SCORE: Record<string, number> = {
  dairy: 78,
  retail: 66,
  textiles: 71,
  poultry: 74,
  manufacturing: 61,
  mobile_electronics: 70,
  food_processing: 68,
  beauty_salon: 65,
  agri_inputs: 72,
  transport_services: 63,
}

export const DEFAULT_BASE_SCORE = 65
export const SCORE_MIN = 32
export const SCORE_MAX = 96

export function clampScore(score: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score))
}

export type VerdictKey = 'verdict.low' | 'verdict.marginal' | 'verdict.moderate' | 'verdict.high'

export function classifyVerdict(score: number): VerdictKey {
  if (score >= 80) return 'verdict.high'
  if (score >= 60) return 'verdict.moderate'
  if (score >= 45) return 'verdict.marginal'
  return 'verdict.low'
}
