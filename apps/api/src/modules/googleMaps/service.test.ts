import { describe, expect, it, vi } from 'vitest'
import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { billingMonth, freeTierCap } from './budget.js'
import type { FallbackMapsProvider } from './fallbackProvider.js'
import { MockGoogleMapsProvider, type GoogleMapsProvider } from './provider.js'
import { getCompetitionDensity, getNearestFacilities, suggestSiteAddress, type GoogleMapsDeps } from './service.js'

const MADURAI = { lat: 9.9252, lon: 78.1198 }

function makeDeps(provider: GoogleMapsProvider = new MockGoogleMapsProvider(), overrides: Partial<GoogleMapsDeps> = {}): GoogleMapsDeps {
  return {
    redis: createFakeRedis(),
    provider,
    fallback: null,
    logger: { info: vi.fn() },
    budget: { sessionCap: 50, dailyCap: 500, freeTierSafetyPercent: 90 },
    timeoutMs: 200,
    fallbackTimeoutMs: 200,
    ...overrides,
  }
}

// kind 'real' so the free-tier gate applies, with the mock's data.
function spyProvider(overrides: Partial<GoogleMapsProvider> = {}): GoogleMapsProvider {
  const mock = new MockGoogleMapsProvider()
  return {
    kind: 'real',
    searchNearby: vi.fn(mock.searchNearby.bind(mock)),
    searchTextIds: vi.fn(mock.searchTextIds.bind(mock)),
    getPlaceLocation: vi.fn(async () => ({ lat: 9.93, lon: 78.12 })),
    computeRouteMatrix: vi.fn(mock.computeRouteMatrix.bind(mock)),
    reverseGeocode: vi.fn(mock.reverseGeocode.bind(mock)),
    ...overrides,
  }
}

function osmFallback(overrides: Partial<FallbackMapsProvider> = {}): FallbackMapsProvider {
  return {
    kind: 'osm',
    nearestFacilities: vi.fn(async () => [
      { category: 'bank' as const, osmRef: 'node/1', location: { lat: MADURAI.lat + 0.02, lon: MADURAI.lon } },
      { category: 'school' as const, osmRef: 'way/2', location: { lat: MADURAI.lat + 0.01, lon: MADURAI.lon } },
    ]),
    routeMatrix: vi.fn(async (_o: unknown, dests: unknown[]) => dests.map((_d, i) => ({ destinationIndex: i, distanceMeters: 3000, durationSeconds: 420 }))),
    reverseGeocode: vi.fn(async () => ({ placeId: null, address: 'Melur Road, Madurai' })),
    ...overrides,
  }
}

async function exhaustFreeTier(redis: GoogleMapsDeps['redis'], sku: Parameters<typeof freeTierCap>[0]) {
  await redis.set(`gmaps:free:${billingMonth()}:${sku}`, String(freeTierCap(sku, 90)))
}

describe('getCompetitionDensity (free Text Search IDs-only only)', () => {
  it('runs one strictly-typed free search per mapped type and counts unique places', async () => {
    const provider = spyProvider({
      searchTextIds: vi
        .fn()
        .mockResolvedValueOnce(['placeA_1234567', 'placeB_1234567'])
        .mockResolvedValueOnce(['placeB_1234567'])
        .mockResolvedValue([]),
    })
    const result = await getCompetitionDensity(makeDeps(provider), { point: MADURAI, businessId: 'retail', sessionId: 's' })
    expect(provider.searchTextIds).toHaveBeenCalledTimes(4)
    expect(provider.searchTextIds).toHaveBeenCalledWith(expect.objectContaining({ includedType: 'grocery_store' }))
    expect(provider.searchNearby).not.toHaveBeenCalled()
    expect(result).toMatchObject({ count: 2, capped: false, source: 'google' })
  })

  it('uses the approved text query for dairy and poultry', async () => {
    const provider = spyProvider()
    const deps = makeDeps(provider)
    await getCompetitionDensity(deps, { point: MADURAI, businessId: 'dairy', sessionId: 's' })
    await getCompetitionDensity(deps, { point: MADURAI, businessId: 'poultry', sessionId: 's' })
    expect(provider.searchTextIds).toHaveBeenCalledWith(expect.objectContaining({ textQuery: 'dairy milk' }))
    expect(provider.searchTextIds).toHaveBeenCalledWith(expect.objectContaining({ textQuery: 'poultry chicken farm' }))
  })

  it('marks the count "or more" when a search fills its 20-result page', async () => {
    const page = Array.from({ length: 20 }, (_, i) => `place_${i}_xxxxxx`)
    const provider = spyProvider({ searchTextIds: vi.fn(async () => page) })
    const result = await getCompetitionDensity(makeDeps(provider), { point: MADURAI, businessId: 'manufacturing', sessionId: 's' })
    expect(result).toMatchObject({ count: 20, capped: true })
  })

  it('is never blocked by the monthly free-tier gate (the SKU is free without limit)', async () => {
    const provider = spyProvider()
    const deps = makeDeps(provider)
    for (const sku of ['places_nearby_search_pro', 'geocoding_reverse', 'routes_compute_route_matrix_essentials'] as const) {
      await exhaustFreeTier(deps.redis, sku)
    }
    expect(await getCompetitionDensity(deps, { point: MADURAI, businessId: 'retail', sessionId: 's' })).not.toBeNull()
  })

  it('returns null, not a partial count, if any one search fails', async () => {
    const provider = spyProvider({ searchTextIds: vi.fn().mockResolvedValueOnce(['a_1234567890']).mockRejectedValue(new Error('quota')) })
    expect(await getCompetitionDensity(makeDeps(provider), { point: MADURAI, businessId: 'textiles', sessionId: 's' })).toBeNull()
  })

  it('serves a repeat lookup from cache', async () => {
    const provider = spyProvider()
    const deps = makeDeps(provider)
    await getCompetitionDensity(deps, { point: MADURAI, businessId: 'dairy', sessionId: 's' })
    await getCompetitionDensity(deps, { point: MADURAI, businessId: 'dairy', sessionId: 's' })
    expect(provider.searchTextIds).toHaveBeenCalledTimes(1)
  })

  it('degrades to null when Google hangs', async () => {
    const hanging = spyProvider({ searchTextIds: vi.fn(() => new Promise<never>(() => {})) })
    expect(await getCompetitionDensity(makeDeps(hanging), { point: MADURAI, businessId: 'dairy', sessionId: 's' })).toBeNull()
  })
})

describe('getNearestFacilities', () => {
  const nearby = (types: string[]) => ({
    places: types.map((t, i) => ({ placeId: `place_${t}_${i}_abcdef`, location: { lat: MADURAI.lat + 0.01 * (i + 1), lon: MADURAI.lon }, types: [t] })),
    attributions: [],
  })

  it('uses Google within the free tier: one combined search + one route matrix', async () => {
    const provider = spyProvider({ searchNearby: vi.fn(async () => nearby(['school', 'bank', 'market'])) })
    const result = await getNearestFacilities(makeDeps(provider, { fallback: osmFallback() }), { point: MADURAI, sessionId: 's' })
    expect(result?.source).toBe('google')
    expect(provider.searchNearby).toHaveBeenCalledTimes(1)
    expect(provider.computeRouteMatrix).toHaveBeenCalledTimes(1)
    expect(Object.keys(result!.facilities).sort()).toEqual(['bank', 'market', 'school'])
  })

  it('makes NO Google call once the Nearby free allowance is spent, and falls back to OpenStreetMap', async () => {
    const provider = spyProvider()
    const fallback = osmFallback()
    const deps = makeDeps(provider, { fallback })
    await exhaustFreeTier(deps.redis, 'places_nearby_search_pro')

    const result = await getNearestFacilities(deps, { point: MADURAI, sessionId: 's' })
    expect(provider.searchNearby).not.toHaveBeenCalled()
    expect(result).toMatchObject({ source: 'openstreetmap', provider: 'real' })
    expect(result!.facilities.bank).toMatchObject({ osmRef: 'node/1', roadDistanceKm: 3, travelMinutes: 7 })
    expect(result!.facilities.bank?.placeId).toBeUndefined()
  })

  it('falls back to OpenStreetMap when Google errors', async () => {
    const provider = spyProvider({ searchNearby: vi.fn(async () => Promise.reject(new Error('OVER_QUERY_LIMIT'))) })
    const result = await getNearestFacilities(makeDeps(provider, { fallback: osmFallback() }), { point: MADURAI, sessionId: 's' })
    expect(result?.source).toBe('openstreetmap')
  })

  it('goes to OpenStreetMap for the whole answer once the Routes allowance is spent (no Nearby spent on it)', async () => {
    const provider = spyProvider()
    const deps = makeDeps(provider, { fallback: osmFallback() })
    await exhaustFreeTier(deps.redis, 'routes_compute_route_matrix_essentials')

    const result = await getNearestFacilities(deps, { point: MADURAI, sessionId: 's' })
    expect(provider.searchNearby).not.toHaveBeenCalled()
    expect(provider.computeRouteMatrix).not.toHaveBeenCalled()
    expect(result).toMatchObject({ source: 'openstreetmap' })
    expect(result!.facilities.bank?.roadDistanceKm).toBe(3)
  })

  it('never mixes sources: if Google routing errors, Google places keep straight-line distances, not OSM routing', async () => {
    const provider = spyProvider({
      searchNearby: vi.fn(async () => nearby(['bank'])),
      computeRouteMatrix: vi.fn(async () => Promise.reject(new Error('500'))),
    })
    const fallback = osmFallback()
    const result = await getNearestFacilities(makeDeps(provider, { fallback }), { point: MADURAI, sessionId: 's' })
    expect(result?.source).toBe('google')
    expect(fallback.routeMatrix).not.toHaveBeenCalled()
    expect(result!.facilities.bank).toMatchObject({ roadDistanceKm: null, travelMinutes: null })
    expect(result!.facilities.bank!.straightLineKm).toBeGreaterThan(0)
  })

  it('returns null (government data only) when Google and the fallback both fail', async () => {
    const provider = spyProvider({ searchNearby: vi.fn(async () => Promise.reject(new Error('down'))) })
    const fallback = osmFallback({ nearestFacilities: vi.fn(async () => Promise.reject(new Error('overpass down'))) })
    expect(await getNearestFacilities(makeDeps(provider, { fallback }), { point: MADURAI, sessionId: 's' })).toBeNull()
  })

  it('reuses cached place_ids and refreshes expired coordinates with Place Details, not a new search', async () => {
    const provider = spyProvider({ searchNearby: vi.fn(async () => nearby(['school', 'bank', 'market'])) })
    const deps = makeDeps(provider)
    await getNearestFacilities(deps, { point: MADURAI, sessionId: 's' })

    const fake = deps.redis as ReturnType<typeof createFakeRedis>
    for (const key of await fake.keys('gmaps:derived:*')) await fake.del(key)
    for (const key of await fake.keys('gmaps:coord:*')) await fake.del(key)
    expect((await fake.keys('gmaps:pid:*')).length).toBe(3)

    await getNearestFacilities(deps, { point: MADURAI, sessionId: 's' })
    expect(provider.searchNearby).toHaveBeenCalledTimes(1)
    expect(provider.getPlaceLocation).toHaveBeenCalledTimes(3)
  })

  it('only pays for a targeted search when the combined one was saturated', async () => {
    const twentySchools = nearby(Array.from({ length: 20 }, () => 'school'))
    const provider = spyProvider({
      searchNearby: vi.fn().mockResolvedValueOnce(twentySchools).mockResolvedValue(nearby(['bank'])),
    })
    const result = await getNearestFacilities(makeDeps(provider), { point: MADURAI, sessionId: 's' })
    expect(provider.searchNearby).toHaveBeenCalledTimes(3)
    expect(result!.facilities.school).toBeDefined()
  })
})

describe('suggestSiteAddress', () => {
  it('returns a Google suggestion and caches nothing', async () => {
    const deps = makeDeps()
    const result = await suggestSiteAddress(deps, { point: MADURAI, sessionId: 's' })
    expect(result).toMatchObject({ source: 'google' })
    const fake = deps.redis as ReturnType<typeof createFakeRedis>
    expect(await fake.keys('gmaps:derived:*')).toEqual([])
  })

  it('falls back to OpenStreetMap Nominatim once the Geocoding free allowance is spent', async () => {
    const provider = spyProvider()
    const deps = makeDeps(provider, { fallback: osmFallback() })
    await exhaustFreeTier(deps.redis, 'geocoding_reverse')
    const result = await suggestSiteAddress(deps, { point: MADURAI, sessionId: 's' })
    expect(provider.reverseGeocode).not.toHaveBeenCalled()
    expect(result).toMatchObject({ address: 'Melur Road, Madurai', source: 'openstreetmap' })
  })
})
