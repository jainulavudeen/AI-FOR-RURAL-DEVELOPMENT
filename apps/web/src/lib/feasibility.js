// Deterministic mock feasibility engine. Produces a stable score, insight
// values and SWOT selection for a given (business, state, district, block)
// combo so the same inputs always render the same report, and selecting a
// different block within the same district shifts the numbers slightly —
// reinforcing that this is genuinely block-level, not just district-level.
//
// BASE_SCORE/clampScore/classifyVerdict come from @setu/core so this offline
// seeded mock and apps/api's real data-backed assembly never silently drift
// apart on the non-financial scoring constants they share.
import { BASE_SCORE, DEFAULT_BASE_SCORE, clampScore, classifyVerdict, liveCompetitionAdjustment } from '@setu/core'
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
  mobile_electronics: ['source.udyam', 'source.marketSurvey', 'source.industries', 'source.logistics'],
  food_processing: ['source.udyam', 'source.mandi', 'source.marketSurvey', 'source.electricity'],
  beauty_salon: ['source.udyam', 'source.marketSurvey', 'source.labour', 'source.logistics'],
  agri_inputs: ['source.udyam', 'source.mandi', 'source.cooperative', 'source.logistics'],
  transport_services: ['source.logistics', 'source.electricity', 'source.marketSurvey', 'source.industries'],
}

const ICONS = {
  dairy: ['Milk', 'Building2', 'Home', 'MapPin'],
  retail: ['Building2', 'Users', 'TrendingUp', 'MapPin'],
  textiles: ['Building2', 'Wallet', 'LineChart', 'Users'],
  poultry: ['Bird', 'Building2', 'Wheat', 'MapPin'],
  manufacturing: ['Factory', 'Zap', 'MapPin', 'TrendingUp'],
  mobile_electronics: ['Smartphone', 'Building2', 'TrendingUp', 'MapPin'],
  food_processing: ['Soup', 'Wheat', 'TrendingUp', 'MapPin'],
  beauty_salon: ['Scissors', 'Users', 'TrendingUp', 'MapPin'],
  agri_inputs: ['Sprout', 'Wheat', 'Building2', 'MapPin'],
  transport_services: ['Truck', 'Zap', 'TrendingUp', 'MapPin'],
}

// Value ranges per business, per insight index: [min, max, decimals]
const VALUE_RANGES = {
  dairy: [[34, 42, 0], [120, 340, 0], [55, 78, 0], [6, 18, 0]],
  retail: [[80, 260, 0], [1200, 4200, 0], [4, 9, 1], [5, 22, 0]],
  textiles: [[60, 210, 0], [320, 480, 0], [-3, 6, 1], [8, 24, 0]],
  poultry: [[85, 140, 0], [40, 180, 0], [-4, 7, 1], [4, 16, 0]],
  manufacturing: [[50, 190, 0], [5.5, 8.5, 1], [3, 20, 0], [3, 11, 0]],
  mobile_electronics: [[15, 60, 0], [500, 2500, 0], [3, 12, 1], [4, 20, 0]],
  food_processing: [[10, 45, 0], [40, 180, 0], [3, 15, 1], [5, 25, 0]],
  beauty_salon: [[5, 30, 0], [300, 1800, 0], [4, 18, 1], [3, 15, 0]],
  agri_inputs: [[8, 35, 0], [400, 2200, 0], [5, 20, 1], [4, 22, 0]],
  transport_services: [[10, 50, 0], [8, 25, 1], [4, 16, 1], [3, 18, 0]],
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

// Offline/first-paint estimate — baseline only (a business-type prior,
// not location data). Demand/infrastructure/market used to be filled in
// with seeded-random noise dressed up as real numbers; CLAUDE.md item 4
// is explicit that this was dishonest ("hashes the inputs into a fake but
// stable number") and must not coexist with the real scoring path. So
// this now only ever returns what's genuinely knowable with zero network:
// the business type's baseline. The other three factors are reported as
// excluded (offline, not "measured as zero"), and applyRealFactors below
// replaces this whole result once the real composite score from
// POST /feasibility/score resolves — never merges partial fake numbers
// into it.
export function generateFeasibility({ businessId, stateId, districtId, blockId }) {
  const seedStr = `${businessId}|${stateId}|${districtId}|${blockId}`
  const rand = seededRandoms(seedStr, 8)

  const base = BASE_SCORE[businessId] ?? DEFAULT_BASE_SCORE
  const score = clampScore(base)

  const factors = [{ labelKey: 'results.factorBaseline', value: base, isBaseline: true, source: { label: 'baseline', asOf: null } }]
  const excludedFactors = [
    { labelKey: 'results.factorDemand', reasonKey: 'results.factorExcludedOffline' },
    { labelKey: 'results.factorInfrastructure', reasonKey: 'results.factorExcludedOffline' },
    { labelKey: 'results.factorMarket', reasonKey: 'results.factorExcludedOffline' },
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
    excludedFactors,
    isEstimate: true,
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

// Replaces the offline baseline-only estimate wholesale with the real
// composite result from apps/api's POST /feasibility/score
// (lib/marketData.js's getFeasibilityScore), once/if that resolves —
// CLAUDE.md item 4: real scoring and the seeded mock never run side by
// side past this point, so this is a replacement, not a factor-by-factor
// overlay (the old design merged real numbers into fake ones factor by
// factor; there are no fake demand/infra/market numbers left to merge
// into). `real` is `null` whenever the API call failed, is still in
// flight, or the device is offline — the baseline-only estimate stays
// standing in that case (CLAUDE.md rule 4: a screen must render with
// nothing but cached state, and a less-explained report beats a blocked
// one). The server already excludes any factor with no real data behind
// it (real.excludedFactors) rather than sending a fake zero, so nothing
// here needs to re-apply that logic.
export function applyRealFactors(feasibility, real) {
  if (!real) return feasibility
  return {
    ...feasibility,
    score: real.score,
    verdictKey: real.verdictKey,
    factors: real.factors,
    excludedFactors: real.excludedFactors ?? [],
    usedAiEstimate: Boolean(real.usedAiEstimate),
    narration: real.narration,
    isEstimate: false,
  }
}

// Adds the live Google competition-density factor to an already-assembled
// (government-data) feasibility result, for DISPLAY only — Results.jsx
// saves and appeals against the government-only score, never this one.
// The weighting and the "never changes the verdict" guard live in
// @setu/core's liveCompetitionAdjustment, not here. A zero adjustment
// (low count, which may just mean "unmapped") is still listed, so the
// user sees the lookup happened and why it didn't move anything.
export function applyLiveCompetition(feasibility, competition) {
  if (!competition) return feasibility
  const adjustment = liveCompetitionAdjustment(feasibility.score, competition.count, competition.capped)
  const score = clampScore(feasibility.score + adjustment.value)
  return {
    ...feasibility,
    score,
    verdictKey: classifyVerdict(score),
    factors: [
      ...feasibility.factors,
      {
        labelKey: 'results.factorLiveCompetition',
        value: adjustment.value,
        // Local calendar date (en-CA gives YYYY-MM-DD): a lookup at 1am IST is "today", not yesterday's UTC date.
        source: { label: 'google_live', asOf: competition.retrievedAt ? new Date(competition.retrievedAt).toLocaleDateString('en-CA') : null },
      },
    ],
    governmentScore: feasibility.score,
  }
}
