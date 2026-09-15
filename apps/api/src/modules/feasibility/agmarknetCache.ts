import type Redis from 'ioredis'
import type { AgmarknetProvider, RawMarketActivity } from './agmarknetProvider'

const FRESH_SECONDS = 6 * 60 * 60 // 6h — Agmarknet itself refreshes ~daily; well inside a day
const TTL_SECONDS = 48 * 60 * 60 // 48h — stale data is still useful; beyond this, nothing

interface CacheEntry {
  snapshot: RawMarketActivity
  fetchedAt: number // epoch ms
}

export interface CachedFetchResult {
  snapshot: RawMarketActivity | null
  isStale: boolean
}

const cacheKey = (district: string) => `agmarknet:${district.toLowerCase()}`

// Stale-while-revalidate: data under FRESH_SECONDS old is returned
// directly; data under TTL_SECONDS old is still returned immediately, with
// a background refetch fired (not awaited — a slow/failed refresh must
// never delay or break this response); beyond TTL_SECONDS nothing is
// served and the caller decides how to degrade (see feasibility/service.ts).
export async function getCachedDistrictActivity(
  redis: Redis,
  provider: AgmarknetProvider,
  district: string
): Promise<CachedFetchResult> {
  const key = cacheKey(district)
  const raw = await redis.get(key)
  const cached: CacheEntry | null = raw ? JSON.parse(raw) : null
  const ageSeconds = cached ? (Date.now() - cached.fetchedAt) / 1000 : Number.POSITIVE_INFINITY

  if (cached && ageSeconds < FRESH_SECONDS) {
    return { snapshot: cached.snapshot, isStale: false }
  }

  if (cached && ageSeconds < TTL_SECONDS) {
    void refetchAndStore(redis, provider, district, key).catch(() => {
      // Background refresh failing is fine — the stale value already served.
    })
    return { snapshot: cached.snapshot, isStale: true }
  }

  try {
    const snapshot = await refetchAndStore(redis, provider, district, key)
    return { snapshot, isStale: false }
  } catch {
    return { snapshot: null, isStale: false }
  }
}

async function refetchAndStore(redis: Redis, provider: AgmarknetProvider, district: string, key: string): Promise<RawMarketActivity> {
  const snapshot = await provider.fetchDistrictActivity(district)
  const entry: CacheEntry = { snapshot, fetchedAt: Date.now() }
  await redis.set(key, JSON.stringify(entry), 'EX', TTL_SECONDS)
  return snapshot
}
