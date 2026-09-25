import { describe, expect, it } from 'vitest'
import { generateFeasibility, applyRealFactors, applyLiveCompetition } from './feasibility'

// Regression coverage for item 4: generateFeasibility must no longer
// fabricate demand/infrastructure/market numbers (CLAUDE.md: "hashes the
// inputs into a fake but stable number" was the exact defect), and
// applyRealFactors must replace that offline estimate wholesale with the
// real server result rather than merging real numbers into fake ones.
describe('generateFeasibility (offline baseline-only estimate)', () => {
  const input = { businessId: 'dairy', stateId: 'tamil_nadu', districtId: 'madurai', blockId: 'block_1' }

  it('only ever returns the baseline factor — no fabricated demand/infra/market numbers', () => {
    const result = generateFeasibility(input)
    expect(result.factors).toHaveLength(1)
    expect(result.factors[0].isBaseline).toBe(true)
    expect(result.isEstimate).toBe(true)
  })

  it('reports demand/infrastructure/market as excluded, with an offline reason, not silently zeroed', () => {
    const result = generateFeasibility(input)
    const excludedKeys = result.excludedFactors.map((f) => f.labelKey)
    expect(excludedKeys).toEqual(
      expect.arrayContaining(['results.factorDemand', 'results.factorInfrastructure', 'results.factorMarket'])
    )
    for (const f of result.excludedFactors) {
      expect(f.reasonKey).toBe('results.factorExcludedOffline')
    }
  })

  it('is deterministic for the same inputs (same business/location always yields the same baseline score)', () => {
    const a = generateFeasibility(input)
    const b = generateFeasibility(input)
    expect(a.score).toBe(b.score)
  })

  it('score equals just the business-type baseline, no location-based swing left to fabricate', () => {
    const result = generateFeasibility(input)
    // dairy's baseline score, unmodified — see @setu/core's BASE_SCORE.
    expect(result.score).toBe(result.factors[0].value)
  })
})

describe('applyRealFactors', () => {
  const baseline = generateFeasibility({ businessId: 'dairy', stateId: 'tamil_nadu', districtId: 'madurai', blockId: 'block_1' })

  it('leaves the offline baseline estimate untouched when no real result is available (still in flight, offline, or failed)', () => {
    expect(applyRealFactors(baseline, null)).toBe(baseline)
  })

  it('replaces the estimate wholesale with the real server result — not a factor-by-factor merge', () => {
    const real = {
      score: 62,
      verdictKey: 'verdict.moderate',
      factors: [
        { labelKey: 'results.factorBaseline', value: 78, isBaseline: true, source: { label: 'baseline', asOf: null } },
        { labelKey: 'results.factorDemand', value: -16, source: { label: 'live', asOf: '2026-09-24' } },
      ],
      excludedFactors: [{ labelKey: 'results.factorInfrastructure', reasonKey: 'results.factorExcludedNoData' }],
      narration: { text: 'Real narration', narrationSource: 'llm', tier: 'fast' },
    }

    const result = applyRealFactors(baseline, real)

    expect(result.score).toBe(62)
    expect(result.verdictKey).toBe('verdict.moderate')
    expect(result.factors).toBe(real.factors)
    expect(result.excludedFactors).toBe(real.excludedFactors)
    expect(result.narration).toBe(real.narration)
    expect(result.isEstimate).toBe(false)
    // insights (a separate, still-seeded concern per CLAUDE.md's Known
    // Gaps — out of scope for item 4's score-only fix) survive the swap.
    expect(result.insights).toBe(baseline.insights)
  })
})

describe('applyLiveCompetition (Google, low weight, display only)', () => {
  const base = { score: 70, verdictKey: 'verdict.moderate', factors: [{ labelKey: 'results.factorBaseline', value: 70, isBaseline: true }] }

  it('adds nothing to the score for a low count — "few results" may mean unmapped', () => {
    const result = applyLiveCompetition(base, { count: 2, capped: false, retrievedAt: '2026-09-25T00:00:00Z' })
    expect(result.score).toBe(70)
    expect(result.factors.at(-1)).toMatchObject({ labelKey: 'results.factorLiveCompetition', value: 0, source: { label: 'google_live' } })
  })

  it('applies at most -2 for a dense (capped) result', () => {
    const result = applyLiveCompetition(base, { count: 20, capped: true })
    expect(result.score).toBe(68)
    expect(result.governmentScore).toBe(70)
  })

  it('never moves the verdict band, so it can never on its own make a business read as unviable', () => {
    const atEdge = { ...base, score: 45, verdictKey: 'verdict.marginal' }
    const result = applyLiveCompetition(atEdge, { count: 20, capped: true })
    expect(result.verdictKey).toBe('verdict.marginal')
    expect(result.score).toBe(45)
  })

  it('is a no-op when there is no live data', () => {
    expect(applyLiveCompetition(base, null)).toBe(base)
  })
})
