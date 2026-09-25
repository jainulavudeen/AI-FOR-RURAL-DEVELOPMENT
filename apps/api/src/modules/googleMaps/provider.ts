import { env } from '../../config/env.js'
import type { LatLon } from './cache.js'

// One adapter for all three Google Maps Platform uses. Only this file talks
// to Google, and nothing it returns carries place names, ratings, reviews,
// photos or phone numbers: the field masks below never request them. The
// one exception is reverse geocoding's formatted address, which goes
// straight back to the user to confirm or correct and is never cached or
// stored (see service.ts's suggestSiteAddress).

export interface NearbyPlace {
  placeId: string
  location: LatLon
  types: string[]
}

export interface ProviderAttribution {
  provider: string
  providerUri?: string
}

export interface NearbyResult {
  places: NearbyPlace[]
  attributions: ProviderAttribution[]
}

export interface RouteElement {
  destinationIndex: number
  distanceMeters: number | null
  durationSeconds: number | null
}

export interface ReverseGeocodeSuggestion {
  placeId: string | null
  address: string
}

export interface GoogleMapsProvider {
  readonly kind: 'mock' | 'real'
  // Places API (New) Nearby Search — billed as Pro (places.id/location/types)
  searchNearby(params: {
    center: LatLon
    radiusMeters: number
    includedTypes: string[]
    maxResultCount: number
    rankByDistance: boolean
  }): Promise<NearbyResult>
  // Places API (New) Text Search with an IDs-only field mask — Essentials
  // (IDs Only) SKU, which is free with no monthly limit. `includedType`
  // (strictly filtered) lets the typed business mappings use it too.
  searchTextIds(params: { textQuery: string; includedType?: string; rectangle: { low: LatLon; high: LatLon } }): Promise<string[]>
  // Places API (New) Place Details, location only — Essentials SKU.
  getPlaceLocation(placeId: string): Promise<LatLon | null>
  // Routes API computeRouteMatrix (not the legacy Distance Matrix API).
  computeRouteMatrix(origin: LatLon, destinations: LatLon[]): Promise<RouteElement[]>
  // Geocoding API reverse geocode.
  reverseGeocode(point: LatLon): Promise<ReverseGeocodeSuggestion | null>
}

const PLACES_BASE = 'https://places.googleapis.com/v1'
const ROUTES_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

interface RawPlace {
  id?: string
  location?: { latitude?: number; longitude?: number }
  types?: string[]
  attributions?: { provider?: string; providerUri?: string }[]
}

function toLatLng(p: LatLon) {
  return { latitude: p.lat, longitude: p.lon }
}

export class RealGoogleMapsProvider implements GoogleMapsProvider {
  readonly kind = 'real' as const

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number
  ) {}

  private async postJson(url: string, fieldMask: string, body: unknown): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`Google Maps request failed: ${response.status}`)
    return response.json()
  }

  async searchNearby(params: Parameters<GoogleMapsProvider['searchNearby']>[0]): Promise<NearbyResult> {
    const data = (await this.postJson(`${PLACES_BASE}/places:searchNearby`, 'places.id,places.location,places.types,places.attributions', {
      includedTypes: params.includedTypes,
      maxResultCount: params.maxResultCount,
      rankPreference: params.rankByDistance ? 'DISTANCE' : 'POPULARITY',
      locationRestriction: { circle: { center: toLatLng(params.center), radius: params.radiusMeters } },
    })) as { places?: RawPlace[] }

    const places: NearbyPlace[] = []
    const attributions = new Map<string, ProviderAttribution>()
    for (const raw of data.places ?? []) {
      if (!raw.id || raw.location?.latitude == null || raw.location.longitude == null) continue
      places.push({ placeId: raw.id, location: { lat: raw.location.latitude, lon: raw.location.longitude }, types: raw.types ?? [] })
      for (const a of raw.attributions ?? []) {
        if (a.provider) attributions.set(a.provider, { provider: a.provider, providerUri: a.providerUri })
      }
    }
    return { places, attributions: [...attributions.values()] }
  }

  async searchTextIds(params: Parameters<GoogleMapsProvider['searchTextIds']>[0]): Promise<string[]> {
    const data = (await this.postJson(`${PLACES_BASE}/places:searchText`, 'places.id', {
      textQuery: params.textQuery,
      ...(params.includedType ? { includedType: params.includedType, strictTypeFiltering: true } : {}),
      pageSize: 20,
      locationRestriction: { rectangle: { low: toLatLng(params.rectangle.low), high: toLatLng(params.rectangle.high) } },
    })) as { places?: RawPlace[] }
    return (data.places ?? []).map((p) => p.id).filter((id): id is string => Boolean(id))
  }

  async getPlaceLocation(placeId: string): Promise<LatLon | null> {
    const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'location' },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) return null
    const data = (await response.json()) as RawPlace
    if (data.location?.latitude == null || data.location.longitude == null) return null
    return { lat: data.location.latitude, lon: data.location.longitude }
  }

  async computeRouteMatrix(origin: LatLon, destinations: LatLon[]): Promise<RouteElement[]> {
    // TRAFFIC_UNAWARE + DRIVE keeps this on the Essentials SKU.
    const data = (await this.postJson(ROUTES_MATRIX_URL, 'destinationIndex,distanceMeters,duration,condition', {
      origins: [{ waypoint: { location: { latLng: toLatLng(origin) } } }],
      destinations: destinations.map((d) => ({ waypoint: { location: { latLng: toLatLng(d) } } })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    })) as { destinationIndex?: number; distanceMeters?: number; duration?: string; condition?: string }[]

    return (Array.isArray(data) ? data : []).map((el) => {
      const exists = el.condition === 'ROUTE_EXISTS'
      return {
        destinationIndex: el.destinationIndex ?? 0,
        distanceMeters: exists ? (el.distanceMeters ?? null) : null,
        durationSeconds: exists && el.duration ? Number.parseInt(el.duration, 10) : null,
      }
    })
  }

  async reverseGeocode(point: LatLon): Promise<ReverseGeocodeSuggestion | null> {
    const url = new URL(GEOCODE_URL)
    url.searchParams.set('latlng', `${point.lat},${point.lon}`)
    url.searchParams.set('key', this.apiKey)
    url.searchParams.set('language', 'en')
    const response = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs) })
    if (!response.ok) return null
    const data = (await response.json()) as { status?: string; results?: { formatted_address?: string; place_id?: string }[] }
    const first = data.status === 'OK' ? data.results?.[0] : undefined
    if (!first?.formatted_address) return null
    return { placeId: first.place_id ?? null, address: first.formatted_address }
  }
}

// Deterministic, labelled demo data so the whole enhancement layer runs
// with no API key. Every response the service builds from this provider is
// marked provider: 'mock', and the UI shows a "demo data" badge on it —
// these are never presented as real Google results.
function seededUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function offsetPoint(origin: LatLon, km: number, bearingUnit: number): LatLon {
  const bearing = bearingUnit * 2 * Math.PI
  const dLat = (km / 111.32) * Math.cos(bearing)
  const dLon = (km / (111.32 * Math.cos((origin.lat * Math.PI) / 180))) * Math.sin(bearing)
  return { lat: origin.lat + dLat, lon: origin.lon + dLon }
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export class MockGoogleMapsProvider implements GoogleMapsProvider {
  readonly kind = 'mock' as const

  async searchNearby(params: Parameters<GoogleMapsProvider['searchNearby']>[0]): Promise<NearbyResult> {
    const seed = `${params.center.lat.toFixed(3)}|${params.center.lon.toFixed(3)}|${params.includedTypes.join(',')}`
    const count = Math.min(params.maxResultCount, Math.floor(seededUnit(seed) * 14))
    const places: NearbyPlace[] = []
    for (let i = 0; i < count; i++) {
      const type = params.includedTypes[i % params.includedTypes.length]!
      const km = 0.8 + seededUnit(`${seed}|d${i}`) * (params.radiusMeters / 1000 - 0.8)
      places.push({
        placeId: `MOCK_${Math.round(seededUnit(`${seed}|id${i}`) * 1e9)}_${type}`,
        location: offsetPoint(params.center, km, seededUnit(`${seed}|b${i}`)),
        types: [type],
      })
    }
    if (params.rankByDistance) places.sort((a, b) => haversineKm(params.center, a.location) - haversineKm(params.center, b.location))
    return { places, attributions: [] }
  }

  async searchTextIds(params: Parameters<GoogleMapsProvider['searchTextIds']>[0]): Promise<string[]> {
    const seed = `${params.rectangle.low.lat.toFixed(3)}|${params.rectangle.low.lon.toFixed(3)}|${params.textQuery}|${params.includedType ?? ''}`
    const count = Math.floor(seededUnit(seed) * 9)
    return Array.from({ length: count }, (_, i) => `MOCK_${Math.round(seededUnit(`${seed}|${i}`) * 1e9)}_text`)
  }

  async getPlaceLocation(): Promise<LatLon | null> {
    return null
  }

  async computeRouteMatrix(origin: LatLon, destinations: LatLon[]): Promise<RouteElement[]> {
    // Rural roads rarely run straight: ~1.35x the crow-flies distance at
    // ~25 km/h average, a plausible demo shape, not a measurement.
    return destinations.map((d, destinationIndex) => {
      const km = haversineKm(origin, d) * 1.35
      return { destinationIndex, distanceMeters: Math.round(km * 1000), durationSeconds: Math.round((km / 25) * 3600) }
    })
  }

  async reverseGeocode(point: LatLon): Promise<ReverseGeocodeSuggestion | null> {
    return { placeId: null, address: `MOCK address near ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` }
  }
}

export function createGoogleMapsProvider(): GoogleMapsProvider {
  if (env.GOOGLE_MAPS_PROVIDER === 'real' && env.GOOGLE_MAPS_API_KEY) {
    return new RealGoogleMapsProvider(env.GOOGLE_MAPS_API_KEY, env.GOOGLE_MAPS_TIMEOUT_MS)
  }
  return new MockGoogleMapsProvider()
}
