import RedisMock from 'ioredis-mock'
import { describe, expect, it, vi } from 'vitest'
import { getCachedBlockId, getCachedDistrictId } from './districtBlockCache'

function makeDb(rows: { id: string }[]) {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('getCachedDistrictId', () => {
  it('queries Postgres on a cache miss and caches the result', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const db = makeDb([{ id: 'district-uuid-1' }])

    const first = await getCachedDistrictId(redis, db, 'Madurai')
    expect(first).toBe('district-uuid-1')
    expect(db.select).toHaveBeenCalledTimes(1)

    const second = await getCachedDistrictId(redis, db, 'Madurai')
    expect(second).toBe('district-uuid-1')
    expect(db.select).toHaveBeenCalledTimes(1) // served from cache, no second query
  })

  it('caches a not-found result too, so a name that never resolves stops hitting Postgres', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const db = makeDb([])

    expect(await getCachedDistrictId(redis, db, 'kanpur')).toBeNull()
    expect(await getCachedDistrictId(redis, db, 'kanpur')).toBeNull()
    expect(db.select).toHaveBeenCalledTimes(1)
  })

  it('falls through to Postgres if Redis reads fail, without throwing', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    vi.spyOn(redis, 'get').mockRejectedValueOnce(new Error('redis down'))
    const db = makeDb([{ id: 'district-uuid-1' }])

    await expect(getCachedDistrictId(redis, db, 'Madurai')).resolves.toBe('district-uuid-1')
    expect(db.select).toHaveBeenCalledTimes(1)
  })
})

describe('getCachedBlockId', () => {
  it('namespaces the cache key by district id, so the same block name under a different district misses', async () => {
    const redis = new RedisMock()
    await redis.flushall()
    const db = makeDb([{ id: 'block-uuid-1' }])

    await getCachedBlockId(redis, db, 'district-a', 'Melur')
    expect(db.select).toHaveBeenCalledTimes(1)

    await getCachedBlockId(redis, db, 'district-b', 'Melur')
    expect(db.select).toHaveBeenCalledTimes(2) // different district -> different cache key
  })
})
