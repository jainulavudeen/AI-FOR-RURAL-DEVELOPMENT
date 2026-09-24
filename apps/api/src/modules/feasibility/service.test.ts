import RedisMock from 'ioredis-mock'
import { describe, expect, it } from 'vitest'
import { villageAmenities, villages } from '../../db/schema'
import type { AgmarknetProvider, RawMarketActivity } from './agmarknetProvider'
import { assembleFeasibilityScore, findDistrictIdByName, getInformalLendingRate, getLocalDemandSignal } from './service'

function makeProvider(fn: AgmarknetProvider['fetchDistrictActivity']): AgmarknetProvider {
  return { fetchDistrictActivity: fn }
}

// ioredis-mock instances share one default in-memory store by design —
// every test here targets the same district ('Madurai'), so each flushes
// first or it silently reads a previous test's cached entry.
describe('getLocalDemandSignal', () => {
  it('returns a live signal on a successful fetch', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const provider = makeProvider(async (district): Promise<RawMarketActivity> => ({
      district,
      prices: [
        { commodity: 'Paddy', market: 'M', modalPrice: 2000, arrivalDate: '2026-01-01' },
        { commodity: 'Maize', market: 'M', modalPrice: 1800, arrivalDate: '2026-01-01' },
      ],
      fetchedAt: new Date().toISOString(),
    }))

    const signal = await getLocalDemandSignal(redis, provider, 'Madurai')
    expect(signal.label).toBe('live')
    expect(signal.commoditiesReported).toBe(2)
    expect(signal.asOf).not.toBeNull()
  })

  it('degrades to neutral, never throwing, when Agmarknet is down and nothing is cached', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const provider = makeProvider(async () => {
      throw new Error('agmarknet unreachable')
    })

    const signal = await getLocalDemandSignal(redis, provider, 'Madurai')
    expect(signal).toEqual({ value: 0, label: 'neutral', asOf: null, commoditiesReported: 0 })
  })

  it('degrades to a labeled cached value, not neutral, when a stale cache entry exists', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const staleEntry = {
      snapshot: {
        district: 'Madurai',
        prices: [{ commodity: 'Paddy', market: 'M', modalPrice: 2000, arrivalDate: '2026-01-01' }],
        fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
      },
      fetchedAt: Date.now() - 7 * 60 * 60 * 1000,
    }
    await redis.set('agmarknet:madurai', JSON.stringify(staleEntry))

    const provider = makeProvider(async () => {
      throw new Error('agmarknet unreachable') // background refetch also fails
    })

    const signal = await getLocalDemandSignal(redis, provider, 'Madurai')
    expect(signal.label).toBe('cached')
    expect(signal.asOf).toBe(staleEntry.snapshot.fetchedAt)
  })

  it('degrades to neutral if the fetch takes too long, never blocking the caller', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const provider = makeProvider(
      () => new Promise((resolve) => setTimeout(() => resolve({ district: 'Madurai', prices: [], fetchedAt: new Date().toISOString() }), 10_000))
    )

    const start = Date.now()
    const signal = await getLocalDemandSignal(redis, provider, 'Madurai')
    const elapsed = Date.now() - start

    expect(signal.label).toBe('neutral')
    expect(elapsed).toBeLessThan(3000) // bounded by the internal ~2.5s timeout, not the 10s fetch
  })
})

describe('getInformalLendingRate', () => {
  it('throws a clear error rather than inventing a number when even the fallback row is missing', async () => {
    // No rows at all simulates a misconfigured/unseeded database — the
    // fallback row is supposed to always exist via the seed script.
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(getInformalLendingRate(db as any, null)).rejects.toThrow(/seed script/)
  })
})

describe('assembleFeasibilityScore', () => {
  it('composes baseline + a real demand signal, excludes infra/shg (no district/block data), and narrates it', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const provider = makeProvider(async (district): Promise<RawMarketActivity> => ({
      district,
      prices: [{ commodity: 'Paddy', market: 'M', modalPrice: 2000, arrivalDate: '2026-01-01' }],
      fetchedAt: new Date().toISOString(),
    }))
    const narrate = async (input: import('../grounding/types').NarrationInput) => ({
      text: `narrated score ${input.numbers['results.score']}`,
      narrationSource: 'llm' as const,
      tier: 'fast' as const,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await assembleFeasibilityScore(
      { db: {} as any, redis, agmarknetProvider: provider, narrate },
      { businessId: 'dairy', districtName: 'Madurai', districtId: null, blockId: null }
    )

    expect(result.score).toBeGreaterThanOrEqual(32)
    expect(result.score).toBeLessThanOrEqual(96)
    expect(result.factors.find((f) => f.isBaseline)?.value).toBe(78) // dairy baseline
    expect(result.factors.find((f) => f.labelKey === 'results.factorDemand')).toBeDefined()
    // districtId/blockId: null -> infra/shg never touch the db, both neutral
    // -> excluded from the score entirely, not included as a fake zero.
    expect(result.factors.find((f) => f.labelKey === 'results.factorInfrastructure')).toBeUndefined()
    expect(result.factors.find((f) => f.labelKey === 'results.factorMarket')).toBeUndefined()
    expect(result.excludedFactors).toEqual(
      expect.arrayContaining([
        { labelKey: 'results.factorInfrastructure', reasonKey: 'results.factorExcludedNoData' },
        { labelKey: 'results.factorMarket', reasonKey: 'results.factorExcludedNoData' },
      ])
    )
    expect(result.narration.text).toContain(String(result.score))
  })

  it('includes infra as a real, sourced factor once a district/block resolves to real ingested data', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const provider = makeProvider(async () => {
      throw new Error('agmarknet down') // keep demand neutral/excluded to isolate the infra assertion
    })
    const narrate = async () => ({ text: 'ok', narrationSource: 'llm' as const, tier: 'fast' as const })

    const fakeDb = {
      select: () => ({
        from: (table: unknown) => {
          if (table === villages) return { where: () => Promise.resolve([{ id: 'village-1' }]) }
          if (table === villageAmenities) {
            return {
              innerJoin: () => ({
                where: () =>
                  Promise.resolve([
                    { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
                    { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
                  ]),
              }),
            }
          }
          // blocks (shgSignal's district-level lookup) / shg_registry — no
          // SHG data in this fixture, isolating the infra assertion.
          return { where: () => Promise.resolve([]), innerJoin: () => ({ where: () => Promise.resolve([]) }) }
        },
      }),
    }

    const result = await assembleFeasibilityScore(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: fakeDb as any, redis, agmarknetProvider: provider, narrate },
      { businessId: 'dairy', districtName: 'Madurai', districtId: 'district-1', blockId: 'block-1' }
    )

    const infraFactor = result.factors.find((f) => f.labelKey === 'results.factorInfrastructure')
    expect(infraFactor).toBeDefined()
    expect(infraFactor?.source.label).toContain('real')
    expect(infraFactor?.source.datasetVersionId).toBe('v1')
  })
})

describe('findDistrictIdByName', () => {
  it('returns the matching district id when a name matches, case-insensitively', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'district-uuid-1' }]) }) }) }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(findDistrictIdByName(db as any, 'Madurai')).resolves.toBe('district-uuid-1')
  })

  it('returns null, not an error, when no district matches', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(findDistrictIdByName(db as any, 'kanpur')).resolves.toBeNull()
  })
})
