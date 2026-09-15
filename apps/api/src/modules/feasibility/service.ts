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

export interface FeasibilityScoreResult {
  score: number
  verdictKey: string
  factors: FeasibilityFactor[]
  narration: NarrationResult
}

export interface AssembleFeasibilityScoreDeps {
  db: Db
  redis: Redis
  agmarknetProvider: AgmarknetProvider
  narrate: (input: NarrationInput) => Promise<NarrationResult>
}

// The real composite score — replaces apps/web's seeded-random mock
// (CLAUDE.md: "assembles real Census / Mission Antyodaya / NRLM factors...
// replaces the deterministic mock factors currently in the frontend"). Each
// non-baseline factor keeps its own source/vintage (rule 3) — the
// factor-by-factor breakdown never collapses into a bare number. Resolving
// district/block names to real DB rows is done by the caller (routes.ts)
// before this is called, so this function itself never throws: every
// signal it composes already degrades to neutral on its own (rule 4).
export async function assembleFeasibilityScore(
  deps: AssembleFeasibilityScoreDeps,
  request: Pick<ScoreRequestBody, 'businessId' | 'locale'> & { districtName: string; blockId: string | null }
): Promise<FeasibilityScoreResult> {
  const base = BASE_SCORE[request.businessId] ?? DEFAULT_BASE_SCORE

  const [demand, infra, shg] = await Promise.all([
    getLocalDemandSignal(deps.redis, deps.agmarknetProvider, request.districtName),
    getInfraSignal(deps.db, request.blockId),
    getShgSignal(deps.db, request.blockId),
  ])

  const score = clampScore(base + demand.value + infra.value + shg.value)
  const verdictKey = classifyVerdict(score)

  const factors: FeasibilityFactor[] = [
    { labelKey: 'results.factorBaseline', value: base, isBaseline: true, source: { label: 'baseline', asOf: null } },
    { labelKey: 'results.factorDemand', value: demand.value, source: { label: demand.label, asOf: demand.asOf } },
    { labelKey: 'results.factorInfrastructure', value: infra.value, source: { label: infra.label, asOf: infra.asOf, datasetVersionId: infra.datasetVersionId } },
    { labelKey: 'results.factorMarket', value: shg.value, source: { label: shg.label, asOf: shg.asOf, datasetVersionId: shg.datasetVersionId } },
  ]

  const narration = await deps.narrate({
    numbers: { score, baseline: base, demand: demand.value, infrastructure: infra.value, market: shg.value },
    factors: factors.map((f) => ({ labelKey: f.labelKey, value: f.value })),
    schemeId: request.businessId,
    schemeName: `${request.businessId} feasibility assessment`,
    groundedClaims: [],
    locale: request.locale ?? 'en',
  })

  return { score, verdictKey, factors, narration }
}
