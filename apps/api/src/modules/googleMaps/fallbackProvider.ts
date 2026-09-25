import { env } from '../../config/env.js'
import type { FacilityCategory } from './businessTypeMapping.js'
import type { LatLon } from './cache.js'
import { haversineKm, type ReverseGeocodeSuggestion, type RouteElement } from './provider.js'

// The free fallback when Google's monthly free allowance is spent, Google
// is down, or no key is configured: OpenStreetMap data via three keyless
// public services —
//   - Photon (komoot): nearest bank / market / school. Chosen over the
//     Overpass API after a live test: public Overpass instances took 11–16 s
//     or timed out for one 10 km query, while Photon answered in ~2 s.
//   - OSRM: road distance + travel time
//   - Nominatim: reverse geocode for the site-address suggestion
// All free, no account, ODbL-licensed ("© OpenStreetMap contributors"
// attribution shown in the UI). Their public servers are fair-use; a large
// deployment self-hosts them (all open source) by pointing PHOTON_URL /
// OSRM_URL at its own instance. Never combined with Google data in one
// answer: a result is either all-Google or all-OSM (Google's terms don't
// allow using its content with a non-Google map service).

export interface OsmFacility {
  category: FacilityCategory
  osmRef: string
  location: LatLon
}

export interface FallbackMapsProvider {
  readonly kind: 'osm' | 'mock'
  nearestFacilities(center: LatLon, radiusMeters: number): Promise<OsmFacility[]>
  routeMatrix(origin: LatLon, destinations: LatLon[]): Promise<RouteElement[]>
  reverseGeocode(point: LatLon): Promise<ReverseGeocodeSuggestion | null>
}

const CATEGORY_OSM_TAG: Record<FacilityCategory, { query: string; tag: string }> = {
  bank: { query: 'bank', tag: 'amenity:bank' },
  market: { query: 'market', tag: 'amenity:marketplace' },
  school: { query: 'school', tag: 'amenity:school' },
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: { osm_type?: string; osm_id?: number }
}

// Pure, testable: the nearest candidate within the radius. Photon's
// location bias is a preference, not a limit (a live test returned
// "markets" 2,300 km away for a pin with none mapped nearby), so the
// radius is enforced here — "nothing within 25 km" is an honest answer.
export function nearestWithin(center: LatLon, radiusMeters: number, category: FacilityCategory, features: PhotonFeature[]): OsmFacility | null {
  let best: { facility: OsmFacility; km: number } | null = null
  for (const f of features) {
    const coords = f.geometry?.coordinates
    if (!coords || f.properties?.osm_id == null) continue
    const location = { lat: coords[1], lon: coords[0] }
    const km = haversineKm(center, location)
    if (km * 1000 > radiusMeters) continue
    if (!best || km < best.km) {
      best = { facility: { category, osmRef: `${f.properties.osm_type ?? '?'}/${f.properties.osm_id}`, location }, km }
    }
  }
  return best?.facility ?? null
}

function boundingBoxParam(center: LatLon, radiusMeters: number): string {
  const dLat = radiusMeters / 1000 / 111.32
  const dLon = radiusMeters / 1000 / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  return [center.lon - dLon, center.lat - dLat, center.lon + dLon, center.lat + dLat].join(',')
}

export class OsmFallbackProvider implements FallbackMapsProvider {
  readonly kind = 'osm' as const

  constructor(
    private readonly photonUrl: string,
    private readonly osrmUrl: string,
    private readonly userAgent: string,
    private readonly timeoutMs: number
  ) {}

  // One Photon query per category, in parallel. A category that fails or
  // has nothing within the radius is simply absent — all results are OSM.
  async nearestFacilities(center: LatLon, radiusMeters: number): Promise<OsmFacility[]> {
    const bbox = boundingBoxParam(center, radiusMeters)
    const settled = await Promise.allSettled(
      (Object.keys(CATEGORY_OSM_TAG) as FacilityCategory[]).map(async (category) => {
        const { query, tag } = CATEGORY_OSM_TAG[category]
        const url = new URL(`${this.photonUrl}/api/`)
        url.searchParams.set('q', query)
        url.searchParams.set('osm_tag', tag)
        url.searchParams.set('lat', String(center.lat))
        url.searchParams.set('lon', String(center.lon))
        url.searchParams.set('bbox', bbox)
        url.searchParams.set('limit', '15')
        const response = await fetch(url, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(this.timeoutMs) })
        if (!response.ok) throw new Error(`Photon request failed: ${response.status}`)
        const data = (await response.json()) as { features?: PhotonFeature[] }
        return nearestWithin(center, radiusMeters, category, data.features ?? [])
      })
    )
    const found = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
    if (found.length === 0 && settled.every((r) => r.status === 'rejected')) throw new Error('Photon unavailable')
    return found
  }

  async routeMatrix(origin: LatLon, destinations: LatLon[]): Promise<RouteElement[]> {
    const coords = [origin, ...destinations].map((p) => `${p.lon},${p.lat}`).join(';')
    const response = await fetch(`${this.osrmUrl}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`, {
      headers: { 'User-Agent': this.userAgent },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!response.ok) throw new Error(`OSRM request failed: ${response.status}`)
    const data = (await response.json()) as { code?: string; distances?: (number | null)[][]; durations?: (number | null)[][] }
    if (data.code !== 'Ok') throw new Error(`OSRM error: ${data.code}`)
    return destinations.map((_, i) => ({
      destinationIndex: i,
      distanceMeters: data.distances?.[0]?.[i + 1] ?? null,
      durationSeconds: data.durations?.[0]?.[i + 1] ?? null,
    }))
  }

  async reverseGeocode(point: LatLon): Promise<ReverseGeocodeSuggestion | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('lat', String(point.lat))
    url.searchParams.set('lon', String(point.lon))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('zoom', '18')
    url.searchParams.set('accept-language', 'en')
    const response = await fetch(url, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(this.timeoutMs) })
    if (!response.ok) return null
    const data = (await response.json()) as { display_name?: string }
    return data.display_name ? { placeId: null, address: data.display_name } : null
  }
}

export function createFallbackProvider(): FallbackMapsProvider | null {
  if (env.MAP_FALLBACK_PROVIDER === 'none') return null
  return new OsmFallbackProvider(env.PHOTON_URL, env.OSRM_URL, env.GEOCODING_USER_AGENT, env.MAP_FALLBACK_TIMEOUT_MS)
}
