import type { RedisLike } from '../../lib/redis/types.js'

// The ONLY place Google-derived data may be kept, and it lives in Redis,
// never Postgres (nothing in modules/googleMaps/ has database access — see
// boundary.test.ts). Google's terms allow:
//   - place_id: stored indefinitely
//   - latitude/longitude: at most 30 consecutive days
//   - anything else (counts, road distances, travel times): not a dataset;
//     we hold it for hours only, to avoid re-billing one report's reload.
// Each tier has its own typed setter, so the TTL is decided here, not by
// the caller: there is no function in this file that can write a
// Google-derived key without an expiry except setPlaceId, and that one only
// accepts a place_id-shaped string.

export const PLACE_ID_TTL_SECONDS = null // no expiry, permitted by the terms
export const COORDS_MAX_TTL_SECONDS = 30 * 24 * 60 * 60
export const DERIVED_MAX_TTL_SECONDS = 6 * 60 * 60

const KEY_PREFIX = {
  placeId: 'gmaps:pid:',
  coords: 'gmaps:coord:',
  derived: 'gmaps:derived:',
} as const

// Fields Google's terms forbid us from keeping. The derived tier
// rejects any value that carries one, even for a few hours — they're never
// needed server-side (the UI shows counts and distances, not places).
const FORBIDDEN_FIELDS = [
  'displayName',
  'name',
  'formattedAddress',
  'formatted_address',
  'shortFormattedAddress',
  'rating',
  'userRatingCount',
  'reviews',
  'photos',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'phone',
  'websiteUri',
]

// Google place IDs are opaque base64url-ish tokens. Rejecting anything with
// spaces or JSON punctuation stops a caller smuggling a name or an object
// into the no-expiry tier.
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,512}$/

export class GoogleCachePolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleCachePolicyError'
  }
}

function findForbiddenField(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELDS.includes(key)) return key
    const nested = findForbiddenField(child)
    if (nested) return nested
  }
  return null
}

export async function setPlaceId(redis: RedisLike, lookupKey: string, placeId: string): Promise<void> {
  if (!PLACE_ID_PATTERN.test(placeId)) {
    throw new GoogleCachePolicyError('Only a bare place_id may be stored without expiry')
  }
  await redis.set(KEY_PREFIX.placeId + lookupKey, placeId)
}

export async function getPlaceId(redis: RedisLike, lookupKey: string): Promise<string | null> {
  return redis.get(KEY_PREFIX.placeId + lookupKey)
}

export interface LatLon {
  lat: number
  lon: number
}

export async function setCoords(redis: RedisLike, placeId: string, coords: LatLon): Promise<void> {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) {
    throw new GoogleCachePolicyError('Coordinates must be finite numbers')
  }
  // Only lat/lon are written, whatever else the caller's object carried.
  await redis.set(KEY_PREFIX.coords + placeId, JSON.stringify({ lat: coords.lat, lon: coords.lon }), {
    ex: COORDS_MAX_TTL_SECONDS,
  })
}

export async function getCoords(redis: RedisLike, placeId: string): Promise<LatLon | null> {
  const raw = await redis.get(KEY_PREFIX.coords + placeId)
  return raw ? (JSON.parse(raw) as LatLon) : null
}

export async function setDerived(redis: RedisLike, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!(ttlSeconds > 0)) throw new GoogleCachePolicyError('Derived Google data must have a positive TTL')
  const forbidden = findForbiddenField(value)
  if (forbidden) throw new GoogleCachePolicyError(`Refusing to cache Google field "${forbidden}"`)
  await redis.set(KEY_PREFIX.derived + key, JSON.stringify(value), {
    ex: Math.min(ttlSeconds, DERIVED_MAX_TTL_SECONDS),
  })
}

export async function getDerived<T>(redis: RedisLike, key: string): Promise<T | null> {
  const raw = await redis.get(KEY_PREFIX.derived + key)
  return raw ? (JSON.parse(raw) as T) : null
}

// ~110 m at 3 decimal places — close enough that two reloads of the same
// report hit the cache, far too coarse to be a per-place table.
export function roundedPointKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}
