import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { describe, expect, it, vi } from 'vitest'
import { getCachedDistrictActivity } from './agmarknetCache.js'
import type { AgmarknetProvider, RawMarketActivity } from './agmarknetProvider.js'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeProvider(overrides: Partial<AgmarknetProvider> = {}): AgmarknetProvider {
  return {
    fetchDistrictActivity: vi.fn(async (district: string): Promise<RawMarketActivity> => ({
      district,
      prices: [{ commodity: 'Paddy', market: 'Test Mandi', modalPrice: 2000, arrivalDate: '2026-01-01' }],
      fetchedAt: new Date().toISOString(),
    })),
    ...overrides,
  }
}

describe('getCachedDistrictActivity', () => {
  it('fetches and caches on first call (nothing cached yet)', async () => {
    const redis = createFakeRedis()
    await redis.flushall()
    const provider = makeProvider()
    const result = await getCachedDistrictActivity(redis, provider, 'Madurai')
    expect(result.isStale).toBe(false)
    expect(result.snapshot?.district).toBe('Madurai')
    expect(provider.fetchDistrictActivity).toHaveBeenCalledTimes(1)
  })

  it('serves from cache without refetching while fresh', async () => {
    const redis = createFakeRedis()
    await redis.flushall()
    const provider = makeProvider()
    await getCachedDistrictActivity(redis, provider, 'Madurai')
    const second = await getCachedDistrictActivity(redis, provider, 'Madurai')
    expect(second.isStale).toBe(false)
    expect(provider.fetchDistrictActivity).toHaveBeenCalledTimes(1)
  })

  it('serves stale data immediately and fires a background refetch, never blocking the response', async () => {
    const redis = createFakeRedis()
    await redis.flushall()
    // Manually seed a cache entry old enough to be stale but not expired,
    // rather than waiting out the real 6h threshold.
    const staleEntry = {
      snapshot: { district: 'Madurai', prices: [], fetchedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() },
      fetchedAt: Date.now() - 7 * 60 * 60 * 1000, // 7h old — past the 6h fresh threshold
    }
    await redis.set('agmarknet:madurai', JSON.stringify(staleEntry))

    const provider = makeProvider()
    const start = Date.now()
    const result = await getCachedDistrictActivity(redis, provider, 'Madurai')
    const elapsed = Date.now() - start

    expect(result.isStale).toBe(true)
    expect(elapsed).toBeLessThan(50) // did not wait on the background refetch

    await sleep(50) // let the fire-and-forget refetch settle
    expect(provider.fetchDistrictActivity).toHaveBeenCalledTimes(1)
  })

  it('returns null when nothing is cached and the fetch itself fails', async () => {
    const redis = createFakeRedis()
    await redis.flushall()
    const provider = makeProvider({ fetchDistrictActivity: vi.fn(async () => { throw new Error('agmarknet down') }) })
    const result = await getCachedDistrictActivity(redis, provider, 'Madurai')
    expect(result.snapshot).toBeNull()
  })

  it('treats data older than the 48h TTL as expired, not stale — attempts a fresh fetch', async () => {
    const redis = createFakeRedis()
    await redis.flushall()
    const expiredEntry = {
      snapshot: { district: 'Madurai', prices: [], fetchedAt: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString() },
      fetchedAt: Date.now() - 49 * 60 * 60 * 1000, // 49h old — past the 48h hard TTL
    }
    await redis.set('agmarknet:madurai', JSON.stringify(expiredEntry))

    const provider = makeProvider()
    const result = await getCachedDistrictActivity(redis, provider, 'Madurai')
    expect(result.isStale).toBe(false) // fresh synchronous fetch, not a stale-serve
    expect(provider.fetchDistrictActivity).toHaveBeenCalledTimes(1)
  })
})
