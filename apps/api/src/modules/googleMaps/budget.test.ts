import { describe, expect, it, vi } from 'vitest'
import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { billingMonth, freeTierCap, readUsage, recordCall, reserveCall, reserveFreeTier } from './budget.js'

describe('reserveCall', () => {
  it('stops a session at its cap', async () => {
    const redis = createFakeRedis()
    const config = { sessionCap: 2, dailyCap: 100, freeTierSafetyPercent: 90 }
    expect((await reserveCall(redis, 's1', config)).allowed).toBe(true)
    expect((await reserveCall(redis, 's1', config)).allowed).toBe(true)
    expect(await reserveCall(redis, 's1', config)).toEqual({ allowed: false, reason: 'session_cap' })
    // another session is unaffected
    expect((await reserveCall(redis, 's2', config)).allowed).toBe(true)
  })

  it('stops every session at the global daily cap', async () => {
    const redis = createFakeRedis()
    const config = { sessionCap: 100, dailyCap: 2, freeTierSafetyPercent: 90 }
    await reserveCall(redis, 'a', config)
    await reserveCall(redis, 'b', config)
    expect(await reserveCall(redis, 'c', config)).toEqual({ allowed: false, reason: 'daily_cap' })
  })

  it('fails closed when Redis is unavailable', async () => {
    const redis = createFakeRedis()
    vi.spyOn(redis, 'incr').mockRejectedValue(new Error('down'))
    expect(await reserveCall(redis, 's', { sessionCap: 5, dailyCap: 5, freeTierSafetyPercent: 90 })).toEqual({ allowed: false, reason: 'budget_unavailable' })
  })
})

describe('recordCall / readUsage', () => {
  it('logs the cost category and counts billable units per SKU, real and mock separately', async () => {
    const redis = createFakeRedis()
    const logger = { info: vi.fn() }
    await recordCall(redis, logger, { sku: 'places_nearby_search_pro', billableUnits: 1, provider: 'real', outcome: 'ok' })
    await recordCall(redis, logger, { sku: 'routes_compute_route_matrix_essentials', billableUnits: 3, provider: 'real', outcome: 'ok' })
    await recordCall(redis, logger, { sku: 'places_nearby_search_pro', billableUnits: 1, provider: 'mock', outcome: 'ok' })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'google_maps_call', costCategory: 'places_nearby_search_pro', estimatedUsd: 0.032 }),
      'google maps call'
    )

    const usage = await readUsage(redis, 1)
    const real = usage.find((u) => u.provider === 'real')!
    expect(real.bySku.routes_compute_route_matrix_essentials?.units).toBe(3)
    expect(real.estimatedUsd).toBeCloseTo(0.032 + 0.015)
    expect(usage.find((u) => u.provider === 'mock')?.bySku.places_nearby_search_pro?.units).toBe(1)
  })
})

describe('reserveFreeTier (never past Google\'s monthly free allowance)', () => {
  it('caps each SKU at the safety fraction of its free allowance', () => {
    expect(freeTierCap('places_nearby_search_pro', 90)).toBe(4500)
    expect(freeTierCap('geocoding_reverse', 100)).toBe(10000)
    expect(freeTierCap('places_text_search_essentials_ids_only', 90)).toBeNull() // free, unlimited
  })

  it('refuses once the monthly cap is reached, counting multi-unit calls', async () => {
    const redis = createFakeRedis()
    const cap = freeTierCap('routes_compute_route_matrix_essentials', 90)!
    await redis.set(`gmaps:free:${billingMonth()}:routes_compute_route_matrix_essentials`, String(cap - 2))
    expect(await reserveFreeTier(redis, 'routes_compute_route_matrix_essentials', 2, 90)).toBe(true)
    expect(await reserveFreeTier(redis, 'routes_compute_route_matrix_essentials', 1, 90)).toBe(false)
  })

  it('always allows the unlimited free SKU', async () => {
    const redis = createFakeRedis()
    for (let i = 0; i < 5; i++) expect(await reserveFreeTier(redis, 'places_text_search_essentials_ids_only', 1, 1)).toBe(true)
  })

  it('fails closed when Redis is unavailable', async () => {
    const redis = createFakeRedis()
    vi.spyOn(redis, 'incrby').mockRejectedValue(new Error('down'))
    expect(await reserveFreeTier(redis, 'geocoding_reverse', 1, 90)).toBe(false)
  })

  it('resets on the Pacific-time calendar month Google bills on', () => {
    // 2026-10-01 05:00 UTC is still 30 Sep in California
    expect(billingMonth(new Date('2026-10-01T05:00:00Z'))).toBe('2026-09')
    expect(billingMonth(new Date('2026-10-01T09:00:00Z'))).toBe('2026-10')
  })
})
