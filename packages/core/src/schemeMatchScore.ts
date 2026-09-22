// A single boolean `eligible` (eligibility.ts) doesn't distinguish a scheme
// that fits loosely from one that fits well — two cost-band schemes might
// both include an applicant's project cost, but one only barely, at the
// very edge of its band. computeMatchScore() turns an eligibility.ts result
// into a 0-100 ranking score for the "Your Ranked Matches" tab.
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts (see
// CLAUDE.md). Built entirely from data eligibility.ts already computed
// (reasons, scheme, kind) plus the same projectCost getEligibleSchemes()
// was called with — no new eligibility criteria are introduced here, so a
// scheme's boolean eligible/ineligible status can never disagree with
// whether it's ranked above or below the eligible schemes around it.
import type { EligibleScheme } from './eligibility'

// A non-eligible or needs-manual-check scheme is never shown in a "ranked
// matches" list (SchemeComparison.jsx already filters to `eligible ===
// true` for that tab) — this floor exists only so the function has a sane,
// documented value if it's ever called on one anyway, rather than
// returning something that reads as a real low-but-plausible match.
const INELIGIBLE_SCORE = 0

// Every eligible scheme starts here — clearing the actual gate is the
// single strongest signal there is. Bonuses on top reflect how comfortably
// it clears that gate, not whether it clears it.
const BASE_ELIGIBLE_SCORE = 70

// Keyed on the trailing segment of an EligibilityReason's key (e.g.
// 'eligibility.reason.categoryMatch' -> 'categoryMatch') — only reasons
// that indicate a *positive* match earn a bonus; mismatch/unknown reasons
// are absent from this map and contribute nothing.
const REASON_BONUS: Record<string, number> = {
  categoryMatch: 10,
  womanOwned: 8,
  stateMatch: 10,
}

// Never claim a perfect, certain 100 — this is a ranking heuristic over
// Setu's own limited inputs, not a certified determination by the
// implementing agency.
const MAX_SCORE = 99

function lastSegment(reasonKey: string): string {
  const parts = reasonKey.split('.')
  return parts[parts.length - 1] ?? reasonKey
}

// How comfortably `projectCost` sits inside [min, max] — 1 at the exact
// midpoint, tapering to 0 at either edge. A scheme an applicant barely
// qualifies for (right at the boundary) is a real match, but a weaker one
// than a scheme sized well within its band.
function costBandCenterednessBonus(min: number, max: number, projectCost: number, maxBonus: number): number {
  if (max <= min) return 0
  const mid = (min + max) / 2
  const halfWidth = (max - min) / 2
  const distanceFromMid = Math.abs(projectCost - mid)
  const centeredness = Math.max(0, 1 - Math.min(1, distanceFromMid / halfWidth))
  return Math.round(centeredness * maxBonus)
}

export function computeMatchScore(item: EligibleScheme, projectCost: number): number {
  if (!item.eligible) return INELIGIBLE_SCORE
  if (item.kind === 'national' && item.needsManualCheck) return INELIGIBLE_SCORE

  let score = BASE_ELIGIBLE_SCORE

  for (const reason of item.reasons) {
    const bonus = REASON_BONUS[lastSegment(reason.key)]
    if (bonus) score += bonus
  }

  if (item.kind === 'generic') {
    score += costBandCenterednessBonus(item.scheme.projectCostMin, item.scheme.projectCostMax, projectCost, 15)
  } else if (item.kind === 'national' && item.scheme.projectCostMin != null && item.scheme.projectCostMax != null) {
    score += costBandCenterednessBonus(item.scheme.projectCostMin, item.scheme.projectCostMax, projectCost, 15)
  }

  return Math.min(MAX_SCORE, score)
}
