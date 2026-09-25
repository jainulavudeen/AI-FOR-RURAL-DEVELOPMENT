import type { RedisLike } from '../../lib/redis/types.js'
import { checkAndIncrement } from '../../lib/rateLimit.js'
import { withTimeout } from '../../lib/withTimeout.js'
import { hasFreeTierHeadroom, reserveCall, reserveFreeTier, recordCall, type BudgetConfig, type CallLogger, type GoogleSku } from './budget.js'
import {
  BUSINESS_TYPE_COMPETITION_QUERY,
  FACILITY_CATEGORIES,
  FACILITY_PLACE_TYPES,
  facilityCategoryForTypes,
  type FacilityCategory,
} from './businessTypeMapping.js'
import {
  DERIVED_MAX_TTL_SECONDS,
  getCoords,
  getDerived,
  getPlaceId,
  roundedPointKey,
  setCoords,
  setDerived,
  setPlaceId,
  type LatLon,
} from './cache.js'
import type { FallbackMapsProvider } from './fallbackProvider.js'
import { haversineKm, type GoogleMapsProvider, type ProviderAttribution, type RouteElement } from './provider.js'
import type { CompetitionDensity, FacilityDistance, NearestFacilities, SiteAddressSuggestion } from './types.js'

// Live ENHANCEMENT only, and FREE ONLY. For every lookup the chain is:
//   1. Google, strictly inside its monthly free allowance (budget.ts)
//   2. OpenStreetMap — free, keyless (fallbackProvider.ts)
//   3. nothing — the report shows government data only
// Nothing here feeds a scheme decision or a stored report, and every
// function returns null rather than throwing (rule 4).

export interface GoogleMapsDeps {
  redis: RedisLike
  provider: GoogleMapsProvider
  fallback: FallbackMapsProvider | null
  logger: CallLogger
  budget: BudgetConfig
  timeoutMs: number
  fallbackTimeoutMs: number
}

export const COMPETITION_RADIUS_METERS = 5000
// Text Search returns at most 20 results per page. Hitting 20 on any one
// search means the true count may be higher — shown as "N or more".
export const COMPETITION_PAGE_SIZE = 20
export const FACILITY_SEARCH_RADIUS_METERS = 25000

const FALLBACK_SESSION_WINDOW_SECONDS = 12 * 60 * 60

// One Google call: session + daily caps, then the monthly FREE-TIER gate
// (real calls only — the mock costs nothing), then the call with a hard
// timeout, then a log line with its cost category. Any refusal or failure
// is null, which is the caller's cue to fall back.
async function googleCall<T>(
  deps: GoogleMapsDeps,
  sessionId: string,
  sku: GoogleSku,
  billableUnits: number,
  call: () => Promise<T>
): Promise<T | null> {
  const skip = (reason: string) => {
    deps.logger.info({ event: 'google_maps_call_skipped', costCategory: sku, reason }, 'google maps call skipped')
    return null
  }
  const decision = await reserveCall(deps.redis, sessionId, deps.budget)
  if (!decision.allowed) return skip(decision.reason)
  if (deps.provider.kind === 'real' && !(await reserveFreeTier(deps.redis, sku, billableUnits, deps.budget.freeTierSafetyPercent))) {
    return skip('free_tier_exhausted')
  }
  try {
    const result = await withTimeout(call(), deps.timeoutMs)
    await recordCall(deps.redis, deps.logger, { sku, billableUnits, provider: deps.provider.kind, outcome: 'ok' })
    return result
  } catch (err) {
    const outcome = err instanceof Error && err.message === 'timed out' ? 'timeout' : 'error'
    await recordCall(deps.redis, deps.logger, { sku, billableUnits, provider: deps.provider.kind, outcome })
    return null
  }
}

// One OpenStreetMap call. Free, but the public servers are fair-use, so
// each session gets the same courtesy cap as Google calls.
async function fallbackCall<T>(deps: GoogleMapsDeps, sessionId: string, what: string, call: (fb: FallbackMapsProvider) => Promise<T>): Promise<T | null> {
  if (!deps.fallback) return null
  try {
    const gate = await checkAndIncrement(deps.redis, `gmaps:fallback:session:${sessionId}`, deps.budget.sessionCap, FALLBACK_SESSION_WINDOW_SECONDS)
    if (!gate.allowed) return null
    const result = await withTimeout(call(deps.fallback), deps.fallbackTimeoutMs)
    deps.logger.info({ event: 'map_fallback_call', source: 'openstreetmap', what, outcome: 'ok' }, 'map fallback call')
    return result
  } catch {
    deps.logger.info({ event: 'map_fallback_call', source: 'openstreetmap', what, outcome: 'error' }, 'map fallback call')
    return null
  }
}

// Rectangle circumscribing the search circle — Text Search only accepts a
// rectangle as a hard restriction. Slightly larger area than the 5 km
// circle, which the UI text reflects ("within about 5 km").
function boundingBox(center: LatLon, radiusMeters: number): { low: LatLon; high: LatLon } {
  const dLat = radiusMeters / 1000 / 111.32
  const dLon = radiusMeters / 1000 / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return {
    low: { lat: center.lat - dLat, lon: center.lon - dLon },
    high: { lat: center.lat + dLat, lon: center.lon + dLon },
  }
}

async function safeCacheGet<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read()
  } catch {
    return null
  }
}

async function safeCacheSet(write: () => Promise<void>): Promise<void> {
  try {
    await write()
  } catch {
    // A cache write failing only costs a future re-fetch.
  }
}

const humanizeType = (type: string) => type.replace(/_/g, ' ')

// Competition density uses ONLY the free, unlimited Text Search IDs-only
// SKU — one search per mapped place type (strict type filter), or the
// text query for dairy/poultry — and counts unique place_ids. No
// OpenStreetMap fallback: OSM shop tagging is too sparse in rural India to
// count competitors honestly, so on failure this is simply absent.
export async function getCompetitionDensity(
  deps: GoogleMapsDeps,
  input: { point: LatLon; businessId: string; sessionId: string }
): Promise<CompetitionDensity | null> {
  const query = BUSINESS_TYPE_COMPETITION_QUERY[input.businessId]
  if (!query) return null

  const cacheKey = `competition:${input.businessId}:${roundedPointKey(input.point.lat, input.point.lon)}`
  const cached = await safeCacheGet(() => getDerived<CompetitionDensity>(deps.redis, cacheKey))
  if (cached) return cached

  const rectangle = boundingBox(input.point, COMPETITION_RADIUS_METERS)
  const searches =
    query.method === 'place_type'
      ? query.includedTypes.map((type) => ({ textQuery: humanizeType(type), includedType: type, rectangle }))
      : [{ textQuery: query.textQuery, rectangle }]

  const results = await Promise.all(
    searches.map((params) => googleCall(deps, input.sessionId, 'places_text_search_essentials_ids_only', 1, () => deps.provider.searchTextIds(params)))
  )
  // Every search must succeed — a partial count would understate density.
  if (results.some((r) => r === null)) return null

  const unique = new Set(results.flatMap((ids) => ids ?? []))
  const density: CompetitionDensity = {
    count: unique.size,
    capped: results.some((ids) => (ids?.length ?? 0) >= COMPETITION_PAGE_SIZE),
    source: 'google',
    method: query.method,
    searchedFor: query.method === 'place_type' ? query.includedTypes : [query.textQuery],
    radiusKm: COMPETITION_RADIUS_METERS / 1000,
    retrievedAt: new Date().toISOString(),
    provider: deps.provider.kind,
  }
  await safeCacheSet(() => setDerived(deps.redis, cacheKey, density, DERIVED_MAX_TTL_SECONDS))
  return density
}

const nearestKey = (category: FacilityCategory, point: LatLon) => `nearest:${category}:${roundedPointKey(point.lat, point.lon)}`

function toDistances(
  origin: LatLon,
  entries: { category: FacilityCategory; location: LatLon; ref: { placeId: string } | { osmRef: string } }[],
  matrix: RouteElement[] | null
): Partial<Record<FacilityCategory, FacilityDistance>> {
  const facilities: Partial<Record<FacilityCategory, FacilityDistance>> = {}
  entries.forEach(({ category, location, ref }, index) => {
    const element = matrix?.find((m) => m.destinationIndex === index)
    facilities[category] = {
      ...ref,
      straightLineKm: Math.round(haversineKm(origin, location) * 10) / 10,
      roadDistanceKm: element?.distanceMeters != null ? Math.round(element.distanceMeters / 100) / 10 : null,
      travelMinutes: element?.durationSeconds != null ? Math.round(element.durationSeconds / 60) : null,
    }
  })
  return facilities
}

// Google path: cached place_ids (kept indefinitely) + coordinates (30
// days, refreshed by a cheap Place Details call), one combined Nearby
// Search for anything missing, then one Routes matrix. Returns null when
// Google yields nothing at all, so the caller can try OpenStreetMap. If
// only the Routes call is unavailable, straight-line distances from
// Google's own coordinates are shown — never OSM routing over Google
// places (the two sources are never mixed).
async function nearestFacilitiesFromGoogle(deps: GoogleMapsDeps, point: LatLon, sessionId: string): Promise<NearestFacilities | null> {
  const resolved = new Map<FacilityCategory, { placeId: string; location: LatLon }>()
  let attributions: ProviderAttribution[] = []

  for (const category of FACILITY_CATEGORIES) {
    const placeId = await safeCacheGet(() => getPlaceId(deps.redis, nearestKey(category, point)))
    if (!placeId) continue
    let location = await safeCacheGet(() => getCoords(deps.redis, placeId))
    if (!location) {
      location = await googleCall(deps, sessionId, 'places_details_essentials', 1, () => deps.provider.getPlaceLocation(placeId))
      if (location) await safeCacheSet(() => setCoords(deps.redis, placeId, location!))
    }
    if (location) resolved.set(category, { placeId, location })
  }

  const remember = async (category: FacilityCategory, placeId: string, location: LatLon) => {
    resolved.set(category, { placeId, location })
    await safeCacheSet(() => setPlaceId(deps.redis, nearestKey(category, point), placeId))
    await safeCacheSet(() => setCoords(deps.redis, placeId, location))
  }

  let missing = FACILITY_CATEGORIES.filter((c) => !resolved.has(c))
  let combinedWasSaturated = false
  if (missing.length > 0) {
    const combined = await googleCall(deps, sessionId, 'places_nearby_search_pro', 1, () =>
      deps.provider.searchNearby({
        center: point,
        radiusMeters: FACILITY_SEARCH_RADIUS_METERS,
        includedTypes: missing.flatMap((c) => FACILITY_PLACE_TYPES[c]),
        maxResultCount: 20,
        rankByDistance: true,
      })
    )
    if (combined) {
      attributions = combined.attributions
      combinedWasSaturated = combined.places.length >= 20
      for (const place of combined.places) {
        const category = facilityCategoryForTypes(place.types)
        if (category && missing.includes(category) && !resolved.has(category)) {
          await remember(category, place.placeId, place.location)
        }
      }
    }
  }

  // A targeted search only when the combined one filled all 20 slots
  // before reaching a category (e.g. 20 schools nearer than any bank).
  missing = FACILITY_CATEGORIES.filter((c) => !resolved.has(c))
  if (combinedWasSaturated) {
    for (const category of missing) {
      const single = await googleCall(deps, sessionId, 'places_nearby_search_pro', 1, () =>
        deps.provider.searchNearby({
          center: point,
          radiusMeters: FACILITY_SEARCH_RADIUS_METERS,
          includedTypes: FACILITY_PLACE_TYPES[category],
          maxResultCount: 1,
          rankByDistance: true,
        })
      )
      const nearest = single?.places[0]
      if (nearest) await remember(category, nearest.placeId, nearest.location)
    }
  }

  if (resolved.size === 0) return null

  const entries = [...resolved.entries()].map(([category, v]) => ({ category, location: v.location, ref: { placeId: v.placeId } }))
  const matrix = await googleCall(deps, sessionId, 'routes_compute_route_matrix_essentials', entries.length, () =>
    deps.provider.computeRouteMatrix(
      point,
      entries.map((e) => e.location)
    )
  )

  return {
    facilities: toDistances(point, entries, matrix),
    source: 'google',
    retrievedAt: new Date().toISOString(),
    provider: deps.provider.kind,
    attributions,
  }
}

async function nearestFacilitiesFromOsm(deps: GoogleMapsDeps, point: LatLon, sessionId: string): Promise<NearestFacilities | null> {
  const found = await fallbackCall(deps, sessionId, 'nearest_facilities', (fb) => fb.nearestFacilities(point, FACILITY_SEARCH_RADIUS_METERS))
  if (!found || found.length === 0) return null
  const entries = found.map((f) => ({ category: f.category, location: f.location, ref: { osmRef: f.osmRef } }))
  const matrix = await fallbackCall(deps, sessionId, 'route_matrix', (fb) =>
    fb.routeMatrix(
      point,
      entries.map((e) => e.location)
    )
  )
  return {
    facilities: toDistances(point, entries, matrix),
    source: 'openstreetmap',
    retrievedAt: new Date().toISOString(),
    provider: deps.fallback?.kind === 'mock' ? 'mock' : 'real',
    attributions: [],
  }
}

export async function getNearestFacilities(
  deps: GoogleMapsDeps,
  input: { point: LatLon; sessionId: string }
): Promise<NearestFacilities | null> {
  const resultKey = `facilities:${roundedPointKey(input.point.lat, input.point.lon)}`
  const cached = await safeCacheGet(() => getDerived<NearestFacilities>(deps.redis, resultKey))
  if (cached) return cached

  // Routes has the smaller free allowance (~3,000 lookups/month vs 4,500
  // for Nearby). Once it can't cover a full matrix, Google could only
  // give straight-line distances, so go to OpenStreetMap for the whole
  // answer (real road distances) rather than spend Nearby allowance on a
  // worse result.
  const googleCanRoute =
    deps.provider.kind !== 'real' ||
    (await hasFreeTierHeadroom(deps.redis, 'routes_compute_route_matrix_essentials', FACILITY_CATEGORIES.length, deps.budget.freeTierSafetyPercent))
  const result =
    (googleCanRoute ? await nearestFacilitiesFromGoogle(deps, input.point, input.sessionId) : null) ??
    (await nearestFacilitiesFromOsm(deps, input.point, input.sessionId))
  if (!result) return null

  // Only cache a complete answer — one missing road distances (routing
  // unavailable) should be retried next time, not pinned for hours.
  const complete = Object.values(result.facilities).every((f) => f?.roadDistanceKm != null)
  if (complete) await safeCacheSet(() => setDerived(deps.redis, resultKey, result, DERIVED_MAX_TTL_SECONDS))
  return result
}

// Reverse geocode for the site-capture confirm step: Google (free tier)
// then Nominatim. Deliberately NOT cached: the suggestion goes to the
// user, who confirms or edits it, and only their text is ever stored.
export async function suggestSiteAddress(
  deps: GoogleMapsDeps,
  input: { point: LatLon; sessionId: string }
): Promise<SiteAddressSuggestion | null> {
  const retrievedAt = new Date().toISOString()
  const google = await googleCall(deps, input.sessionId, 'geocoding_reverse', 1, () => deps.provider.reverseGeocode(input.point))
  if (google) return { address: google.address, source: 'google', provider: deps.provider.kind, retrievedAt }
  const osm = await fallbackCall(deps, input.sessionId, 'reverse_geocode', (fb) => fb.reverseGeocode(input.point))
  if (osm) return { address: osm.address, source: 'openstreetmap', provider: deps.fallback?.kind === 'mock' ? 'mock' : 'real', retrievedAt }
  return null
}
