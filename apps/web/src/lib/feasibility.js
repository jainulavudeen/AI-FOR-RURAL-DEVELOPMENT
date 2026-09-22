// Deterministic mock feasibility engine. Produces a stable score, insight
// values and SWOT selection for a given (business, state, district, block)
// combo so the same inputs always render the same report, and selecting a
// different block within the same district shifts the numbers slightly —
// reinforcing that this is genuinely block-level, not just district-level.
//
// BASE_SCORE/clampScore/classifyVerdict come from @setu/core so this offline
// seeded mock and apps/api's real data-backed assembly never silently drift
// apart on the non-financial scoring constants they share.
import { BASE_SCORE, DEFAULT_BASE_SCORE, clampScore, classifyVerdict } from '@setu/core'
import { BUSINESS_TYPES } from '../data/businesses'

// A suggestion only earns its place on the report if the gap is real, not
// seeded noise — generateFeasibility's own demand/infra/market factors each
// swing several points on identical inputs, so a 1-2 point "better" business
// would just be noise dressed up as advice.
const ALTERNATIVE_SCORE_MARGIN = 8

const SOURCE_KEYS = {
  dairy: ['source.mandi', 'source.udyam', 'source.census', 'source.cooperative'],
  retail: ['source.udyam', 'source.marketSurvey', 'source.census', 'source.logistics'],
  textiles: ['source.udyam', 'source.labour', 'source.mandi', 'source.census'],
  poultry: ['source.mandi', 'source.udyam', 'source.mandi', 'source.animalHusbandry'],
  manufacturing: ['source.udyam', 'source.electricity', 'source.industries', 'source.udyam'],
}

const ICONS = {
  dairy: ['Milk', 'Building2', 'Home', 'MapPin'],
  retail: ['Building2', 'Users', 'TrendingUp', 'MapPin'],
  textiles: ['Building2', 'Wallet', 'LineChart', 'Users'],
  poultry: ['Bird', 'Building2', 'Wheat', 'MapPin'],
  manufacturing: ['Factory', 'Zap', 'MapPin', 'TrendingUp'],
}

// Value ranges per business, per insight index: [min, max, decimals]
const VALUE_RANGES = {
  dairy: [[34, 42, 0], [120, 340, 0], [55, 78, 0], [6, 18, 0]],
  retail: [[80, 260, 0], [1200, 4200, 0], [4, 9, 1], [5, 22, 0]],
  textiles: [[60, 210, 0], [320, 480, 0], [-3, 6, 1], [8, 24, 0]],
  poultry: [[85, 140, 0], [40, 180, 0], [-4, 7, 1], [4, 16, 0]],
  manufacturing: [[50, 190, 0], [5.5, 8.5, 1], [3, 20, 0], [3, 11, 0]],
}

// Block-level financial-inclusion insights, shared across all business types.
const FINANCIAL_ICONS = ['Landmark', 'CreditCard', 'Users']
const FINANCIAL_SOURCES = ['source.banking', 'source.credit', 'source.nrlm']
const FINANCIAL_RANGES = [[3, 9, 1], [18, 45, 0], [2, 11, 0]]

function hashSeed(str) {
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function seededRandoms(seedStr, count) {
  let seed = hashSeed(seedStr) || 1
  const out = []
  for (let i = 0; i < count; i += 1) {
    seed = (seed * 9301 + 49297) % 233280
    out.push(seed / 233280)
  }
  return out
}

export function generateFeasibility({ businessId, stateId, districtId, blockId }) {
  const seedStr = `${businessId}|${stateId}|${districtId}|${blockId}`
  const rand = seededRandoms(seedStr, 8)

  const base = BASE_SCORE[businessId] ?? DEFAULT_BASE_SCORE
  const demandFactor = Math.round((rand[1] - 0.5) * 14) // -7..7
  const infraFactor = Math.round((rand[2] - 0.5) * 12) // -6..6
  const marketFactor = Math.round((rand[3] - 0.5) * 10) // -5..5
  const score = clampScore(base + demandFactor + infraFactor + marketFactor)

  const factors = [
    { labelKey: 'results.factorBaseline', value: base, isBaseline: true },
    { labelKey: 'results.factorDemand', value: demandFactor },
    { labelKey: 'results.factorInfrastructure', value: infraFactor },
    { labelKey: 'results.factorMarket', value: marketFactor },
  ]

  const verdictKey = classifyVerdict(score)

  const ranges = VALUE_RANGES[businessId] ?? VALUE_RANGES.retail
  const icons = ICONS[businessId] ?? ICONS.retail
  const sources = SOURCE_KEYS[businessId] ?? SOURCE_KEYS.retail

  const businessInsights = ranges.map(([min, max, decimals], idx) => {
    const r = rand[(idx + 1) % rand.length]
    const raw = min + r * (max - min)
    const value = decimals > 0 ? Number(raw.toFixed(decimals)) : Math.round(raw)
    return {
      textKey: `insights.${businessId}.${idx}`,
      value,
      icon: icons[idx],
      sourceKey: sources[idx],
    }
  })

  const financialInsights = FINANCIAL_RANGES.map(([min, max, decimals], idx) => {
    const r = rand[(idx + 5) % rand.length]
    const raw = min + r * (max - min)
    const value = decimals > 0 ? Number(raw.toFixed(decimals)) : Math.round(raw)
    return {
      textKey: `insights.financial.${idx}`,
      value,
      icon: FINANCIAL_ICONS[idx],
      sourceKey: FINANCIAL_SOURCES[idx],
    }
  })

  return {
    score,
    verdictKey,
    factors,
    insights: [...businessInsights, ...financialInsights],
  }
}

// Scans every other business type at the same location and surfaces the
// highest-scoring one, if it clears ALTERNATIVE_SCORE_MARGIN over the
// applicant's chosen business — reusing generateFeasibility exactly as
// Compare.jsx already does (CLAUDE.md boundary rule 1: never fork the
// scoring logic, only call it repeatedly). Returns null when the chosen
// business is already the best option, or close enough that a suggestion
// would just be noise.
export function getBestAlternativeBusiness({ businessId, stateId, districtId, blockId }) {
  const currentScore = generateFeasibility({ businessId, stateId, districtId, blockId }).score

  let best = null
  for (const business of BUSINESS_TYPES) {
    if (business.id === businessId) continue
    const feasibility = generateFeasibility({ businessId: business.id, stateId, districtId, blockId })
    if (!best || feasibility.score > best.feasibility.score) {
      best = { business, feasibility }
    }
  }

  if (!best || best.feasibility.score - currentScore < ALTERNATIVE_SCORE_MARGIN) return null
  return { ...best, currentScore }
}

// The informal-lender rate used to live here as a seeded-random mock. It's
// now sourced from the backend (lib/marketData.js's getInformalLendingRate,
// GET /feasibility/informal-lending-rate) — a real two-tier lookup
// (district-specific once ingested, else a single honestly-labelled
// regional estimate) instead of a per-block fabricated number. See
// CLAUDE.md.

// Overlays a real Agmarknet-derived local-demand signal (lib/marketData.js's
// getLocalDemandSignal) onto the seeded base result. generateFeasibility
// itself stays synchronous and offline-first (CLAUDE.md: a screen must
// render with nothing but cached state) — this is a pure, optional second
// pass applied once/if the live signal resolves, never blocking the first
// render. Only overrides when the signal is better than nothing: a
// 'neutral' label means Agmarknet was unavailable, so the seeded factor
// (itself in the same -7..7 range) is left standing rather than zeroed out.
export function applyDemandSignal(feasibility, signal) {
  if (!signal || signal.label === 'neutral') return feasibility

  const factors = feasibility.factors.map((f) =>
    f.labelKey === 'results.factorDemand'
      ? { ...f, value: signal.value, sourceNote: signal.label, sourceAsOf: signal.asOf }
      : f
  )
  const demandDelta = signal.value - (feasibility.factors.find((f) => f.labelKey === 'results.factorDemand')?.value ?? 0)
  const score = clampScore(feasibility.score + demandDelta)
  const verdictKey = classifyVerdict(score)

  return { ...feasibility, score, verdictKey, factors }
}

// Overlays the real, ingested-data-backed infra/market factors (Census
// village_amenities, NRLM SHG registry) and the grounding narration from
// apps/api's POST /feasibility/score (lib/marketData.js's
// getFeasibilityScore), once/if that resolves — same non-blocking overlay
// pattern as applyDemandSignal. Only overrides a factor whose real source
// isn't 'neutral': today, every block resolves to 'neutral' infra/market
// data (the mock block names don't match real Census/Mission Antyodaya
// blocks, and NRLM SHG data hasn't been sourced at all — see CLAUDE.md
// Known Gaps), so this is honestly a no-op until real data lands for a
// resolvable block. `real` is `null` whenever the API call itself failed
// or is still in flight.
export function applyRealFactors(feasibility, real) {
  if (!real) return feasibility

  let factors = feasibility.factors
  let scoreDelta = 0

  for (const labelKey of ['results.factorInfrastructure', 'results.factorMarket']) {
    const realFactor = real.factors?.find((f) => f.labelKey === labelKey)
    if (!realFactor || realFactor.source?.label === 'neutral') continue

    const currentValue = factors.find((f) => f.labelKey === labelKey)?.value ?? 0
    scoreDelta += realFactor.value - currentValue
    factors = factors.map((f) =>
      f.labelKey === labelKey
        ? { ...f, value: realFactor.value, sourceNote: realFactor.source.label, sourceAsOf: realFactor.source.asOf }
        : f
    )
  }

  if (scoreDelta === 0 && !real.narration) return feasibility

  const score = clampScore(feasibility.score + scoreDelta)
  const verdictKey = classifyVerdict(score)

  return { ...feasibility, score, verdictKey, factors, narration: real.narration ?? feasibility.narration }
}
