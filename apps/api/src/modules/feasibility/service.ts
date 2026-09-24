import { and, eq, ilike, isNull } from 'drizzle-orm'
import type Redis from 'ioredis'
import { BASE_SCORE, DEFAULT_BASE_SCORE, classifyVerdict, clampScore } from '@setu/core'
import type { Db } from '../../db/client'
import { blocks, districts, informalLendingRates } from '../../db/schema'
import { withTimeout } from '../../lib/withTimeout'
import type { NarrationInput, NarrationResult } from '../grounding/types'
import { getCachedDistrictActivity } from './agmarknetCache'
import type { AgmarknetProvider } from './agmarknetProvider'
import { getInfraSignal } from './infraSignal'
import { getShgSignal } from './shgSignal'
import type { ScoreRequestBody } from './types'

// Score assembly. Today the web app's feasibility score is seeded-random
// mock data (see CLAUDE.md, Known Gaps — apps/web/src/lib/feasibility.js).
// This module assembles real *signals* the score would eventually
// incorporate — the local-demand one below is real; full score assembly
// (joining ingested infrastructure indicators too) is separate work, not
// done here.

export type DemandSignalLabel = 'live' | 'cached' | 'neutral'

export interface DemandSignal {
  value: number
  label: DemandSignalLabel
  asOf: string | null
  commoditiesReported: number
}

const TIMEOUT_MS = 2500

// Generic local-market-activity proxy, not a per-business commodity match
// (confirmed design choice — see CLAUDE.md: Agmarknet only covers
// agricultural commodities, most business types have no natural mapping).
// More actively-reporting commodities and higher price dispersion both
// read as more local economic activity. Bounded to roughly the same
// -7..+7 range the previous seeded-random demand factor used.
function computeActivityValue(prices: { modalPrice: number }[]): number {
  if (prices.length === 0) return 0
  const countSignal = Math.min(prices.length, 10) / 10 // 0..1
  const mean = prices.reduce((sum, p) => sum + p.modalPrice, 0) / prices.length
  const variance = prices.reduce((sum, p) => sum + (p.modalPrice - mean) ** 2, 0) / prices.length
  const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 0
  const volatilitySignal = Math.min(coefficientOfVariation, 1) // 0..1
  return Math.round((countSignal * 0.6 + volatilitySignal * 0.4) * 14 - 7)
}

// Never throws, never blocks a report — CLAUDE.md rule 4. Agmarknet down,
// slow, or timed out degrades to the cached value (labeled 'cached', with
// its own asOf so the explanation can say how old it is) or a neutral 0
// with no cached fallback — never an error surfaced to the caller.
export async function getLocalDemandSignal(redis: Redis, provider: AgmarknetProvider, district: string): Promise<DemandSignal> {
  try {
    const result = await withTimeout(getCachedDistrictActivity(redis, provider, district), TIMEOUT_MS)
    if (!result.snapshot) {
      return { value: 0, label: 'neutral', asOf: null, commoditiesReported: 0 }
    }
    return {
      value: computeActivityValue(result.snapshot.prices),
      label: result.isStale ? 'cached' : 'live',
      asOf: result.snapshot.fetchedAt,
      commoditiesReported: result.snapshot.prices.length,
    }
  } catch {
    return { value: 0, label: 'neutral', asOf: null, commoditiesReported: 0 }
  }
}

export interface InformalLendingRateResult {
  ratePercent: number
  label: 'district' | 'regional_estimate'
  vintageLabel: string
}

// Two-tier: a district-specific row if one exists (none do yet — see
// CLAUDE.md, no AIDIS ingestion pipeline built), else the single
// district_id-null regional-estimate row, which always exists (seeded).
export async function getInformalLendingRate(db: Db, districtId: string | null): Promise<InformalLendingRateResult> {
  if (districtId) {
    const [districtRow] = await db.select().from(informalLendingRates).where(eq(informalLendingRates.districtId, districtId)).limit(1)
    if (districtRow) {
      return { ratePercent: Number(districtRow.ratePercent), label: 'district', vintageLabel: districtRow.vintageLabel }
    }
  }

  const [fallback] = await db.select().from(informalLendingRates).where(isNull(informalLendingRates.districtId)).limit(1)
  if (!fallback) {
    // The seed row should always exist — this is a real misconfiguration,
    // not a normal "no data for this district" case. Surface it rather
    // than inventing a number to paper over it.
    throw new Error('No regional-fallback informal_lending_rates row found — was the seed script run?')
  }
  return { ratePercent: Number(fallback.ratePercent), label: 'regional_estimate', vintageLabel: fallback.vintageLabel }
}

// Bridges the web app's mock district slugs ('madurai', 'kanpur', ...) to
// real Postgres district UUIDs by name, case-insensitively. Only Madurai
// (the seeded pilot district) will ever resolve today — every other mock
// district correctly returns null and the caller falls through to the
// honest regional-estimate fallback, not an error.
export async function findDistrictIdByName(db: Db, name: string): Promise<string | null> {
  const [row] = await db.select({ id: districts.id }).from(districts).where(ilike(districts.name, name)).limit(1)
  return row?.id ?? null
}

// Same bridge, one level finer — but see CLAUDE.md's naming-scheme gap:
// apps/web's mock blocks ('Block A', 'Block 1', ...) don't share names with
// the real Census/Mission Antyodaya blocks ('Melur', 'Alanganallur', ...)
// loaded under Madurai. This will legitimately return null for every mock
// block today; callers (infraSignal.ts, shgSignal.ts) treat that exactly
// like "no data for this block", not an error.
export async function findBlockIdByName(db: Db, districtId: string, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.districtId, districtId), ilike(blocks.name, name)))
    .limit(1)
  return row?.id ?? null
}

export interface FeasibilityFactor {
  labelKey: string
  value: number
  isBaseline?: boolean
  source: { label: string; asOf: string | null; datasetVersionId?: string | null }
}

// A factor the score does NOT include, and why — CLAUDE.md item 4's
// explicit rule: "when a factor's data is missing for a block, say so on
// screen and exclude it from the score — do NOT silently substitute a
// national average and present it as local." reasonKey is an i18n key,
// not raw English, so the frontend can render it in the current language.
export interface ExcludedFactor {
  labelKey: string
  reasonKey: 'results.factorExcludedNoData'
}

export interface FeasibilityScoreResult {
  score: number
  verdictKey: string
  factors: FeasibilityFactor[]
  excludedFactors: ExcludedFactor[]
  narration: NarrationResult
}

export interface AssembleFeasibilityScoreDeps {
  db: Db
  redis: Redis
  agmarknetProvider: AgmarknetProvider
  narrate: (input: NarrationInput) => Promise<NarrationResult>
}

const DEMAND_SIGNAL_LABELS: Record<string, string> = { live: 'live', cached: 'cached' }
const INFRA_SHG_LABELS: Record<string, string> = { real_block: 'real (block-level)', real_district: 'real (district-level)' }

// The real composite score — replaces apps/web's seeded-random mock
// (CLAUDE.md: "assembles real Census / Mission Antyodaya / NRLM factors...
// replaces the deterministic mock factors currently in the frontend").
// Only the baseline (a business-type prior, not location data) is always
// included; every other factor is included only when its underlying
// signal actually resolved to real data — a signal that came back
// 'neutral' (no data for this district/block) is dropped from both the
// factor list AND the score sum, listed in excludedFactors instead, never
// silently zeroed in as if "neutral" meant "measured as average." Each
// included factor keeps its own source/vintage (rule 3). Resolving
// district/block names to real DB rows is done by the caller (routes.ts)
// before this is called, so this function itself never throws: every
// signal it composes already degrades to neutral on its own (rule 4).
export async function assembleFeasibilityScore(
  deps: AssembleFeasibilityScoreDeps,
  request: Pick<ScoreRequestBody, 'businessId' | 'locale'> & { districtName: string; districtId: string | null; blockId: string | null }
): Promise<FeasibilityScoreResult> {
  const base = BASE_SCORE[request.businessId] ?? DEFAULT_BASE_SCORE

  const [demand, infra, shg] = await Promise.all([
    getLocalDemandSignal(deps.redis, deps.agmarknetProvider, request.districtName),
    getInfraSignal(deps.db, request.districtId, request.blockId),
    getShgSignal(deps.db, request.districtId, request.blockId),
  ])

  const factors: FeasibilityFactor[] = [
    { labelKey: 'results.factorBaseline', value: base, isBaseline: true, source: { label: 'baseline', asOf: null } },
  ]
  const excludedFactors: ExcludedFactor[] = []

  if (demand.label === 'neutral') {
    excludedFactors.push({ labelKey: 'results.factorDemand', reasonKey: 'results.factorExcludedNoData' })
  } else {
    factors.push({
      labelKey: 'results.factorDemand',
      value: demand.value,
      source: { label: DEMAND_SIGNAL_LABELS[demand.label] ?? demand.label, asOf: demand.asOf },
    })
  }

  if (infra.label === 'neutral') {
    excludedFactors.push({ labelKey: 'results.factorInfrastructure', reasonKey: 'results.factorExcludedNoData' })
  } else {
    factors.push({
      labelKey: 'results.factorInfrastructure',
      value: infra.value,
      source: { label: INFRA_SHG_LABELS[infra.label] ?? infra.label, asOf: infra.asOf, datasetVersionId: infra.datasetVersionId },
    })
  }

  if (shg.label === 'neutral') {
    excludedFactors.push({ labelKey: 'results.factorMarket', reasonKey: 'results.factorExcludedNoData' })
  } else {
    factors.push({
      labelKey: 'results.factorMarket',
      value: shg.value,
      source: { label: INFRA_SHG_LABELS[shg.label] ?? shg.label, asOf: shg.asOf, datasetVersionId: shg.datasetVersionId },
    })
  }

  const score = clampScore(factors.reduce((sum, f) => sum + f.value, 0))
  const verdictKey = classifyVerdict(score)

  const narration = await deps.narrate({
    numbers: Object.fromEntries(factors.map((f) => [f.labelKey, f.value]).concat([['results.score', score]])),
    factors: factors.map((f) => ({ labelKey: f.labelKey, value: f.value })),
    schemeId: request.businessId,
    schemeName: `${request.businessId} feasibility assessment`,
    groundedClaims: [],
    locale: request.locale ?? 'en',
  })

  return { score, verdictKey, factors, excludedFactors, narration }
}
