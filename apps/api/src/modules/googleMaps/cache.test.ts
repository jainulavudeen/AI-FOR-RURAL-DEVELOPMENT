import { describe, expect, it } from 'vitest'
import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import {
  COORDS_MAX_TTL_SECONDS,
  DERIVED_MAX_TTL_SECONDS,
  GoogleCachePolicyError,
  getCoords,
  getPlaceId,
  setCoords,
  setDerived,
  setPlaceId,
} from './cache.js'

describe('Google Maps TTL cache', () => {
  it('stores a place_id with no expiry', async () => {
    const redis = createFakeRedis()
    await setPlaceId(redis, 'nearest:bank:9.925,78.120', 'ChIJN1t_tDeuEmsRUsoyG83frY4')
    expect(await getPlaceId(redis, 'nearest:bank:9.925,78.120')).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4')
    expect(await redis.ttl('gmaps:pid:nearest:bank:9.925,78.120')).toBe(-1)
  })

  it('refuses to put anything but a bare place_id in the no-expiry tier', async () => {
    const redis = createFakeRedis()
    await expect(setPlaceId(redis, 'k', 'State Bank of India, Melur')).rejects.toThrow(GoogleCachePolicyError)
    await expect(setPlaceId(redis, 'k', '{"displayName":"x"}')).rejects.toThrow(GoogleCachePolicyError)
  })

  it('expires coordinates at 30 days and keeps only lat/lon', async () => {
    const redis = createFakeRedis()
    const smuggled = { lat: 9.9, lon: 78.1, displayName: 'Some Bank' } as unknown as { lat: number; lon: number }
    await setCoords(redis, 'place123456', smuggled)
    const ttl = await redis.ttl('gmaps:coord:place123456')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(COORDS_MAX_TTL_SECONDS)
    expect(await getCoords(redis, 'place123456')).toEqual({ lat: 9.9, lon: 78.1 })
  })

  it('clamps derived data to hours even if a caller asks for longer', async () => {
    const redis = createFakeRedis()
    await setDerived(redis, 'competition:x', { count: 3 }, 365 * 24 * 60 * 60)
    expect(await redis.ttl('gmaps:derived:competition:x')).toBeLessThanOrEqual(DERIVED_MAX_TTL_SECONDS)
  })

  it('refuses a derived value with no TTL', async () => {
    const redis = createFakeRedis()
    await expect(setDerived(redis, 'x', { count: 1 }, 0)).rejects.toThrow(GoogleCachePolicyError)
  })

  it('refuses to cache forbidden Google fields, even nested', async () => {
    const redis = createFakeRedis()
    await expect(setDerived(redis, 'x', { places: [{ rating: 4.5 }] }, 60)).rejects.toThrow(/rating/)
    await expect(setDerived(redis, 'x', { formattedAddress: 'Main Rd' }, 60)).rejects.toThrow(/formattedAddress/)
    await expect(setDerived(redis, 'x', { photos: [] }, 60)).rejects.toThrow(/photos/)
  })
})
