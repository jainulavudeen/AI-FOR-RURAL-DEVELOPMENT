import type { RedisLike } from '../../lib/redis/types'
import type { Db } from '../../db/client'
import { findBlockIdByName, findDistrictIdByName } from './service'

// District/block name->id lookups almost never change mid-session (or
// mid-day) — real reference data, not a live signal like Agmarknet. Read-
// through cache in front of Postgres, same fail-open convention as
// agmarknetCache.ts: any Redis failure (read or write) is swallowed and
// falls through to the live Postgres query — a cache outage must never
// turn into a broken lookup (CLAUDE.md rule 4).
const TTL_SECONDS = 24 * 60 * 60 // 24h

const districtKey = (name: string) => `district-id:${name.toLowerCase()}`
const blockKey = (districtId: string, name: string) => `block-id:${districtId}:${name.toLowerCase()}`

// A cached "not found" (id: null) is itself a useful cache hit — most
// caller-supplied names are apps/web's mock slugs that will never resolve
// (see CLAUDE.md's naming-scheme gap) — so undefined (cache miss) and null
// (cached miss) are distinguished here.
async function readCachedId(redis: RedisLike, key: string): Promise<string | null | undefined> {
  try {
    const raw = await redis.get(key)
    if (raw === null) return undefined
    return (JSON.parse(raw) as { id: string | null }).id
  } catch {
    return undefined
  }
}

async function writeCachedId(redis: RedisLike, key: string, id: string | null): Promise<void> {
  try {
    await redis.set(key, JSON.stringify({ id }), { ex: TTL_SECONDS })
  } catch {
    // Best-effort — a failed cache write must never fail the request.
  }
}

export async function getCachedDistrictId(redis: RedisLike, db: Db, name: string): Promise<string | null> {
  const key = districtKey(name)
  const cached = await readCachedId(redis, key)
  if (cached !== undefined) return cached
  const id = await findDistrictIdByName(db, name)
  await writeCachedId(redis, key, id)
  return id
}

export async function getCachedBlockId(redis: RedisLike, db: Db, districtId: string, name: string): Promise<string | null> {
  const key = blockKey(districtId, name)
  const cached = await readCachedId(redis, key)
  if (cached !== undefined) return cached
  const id = await findBlockIdByName(db, districtId, name)
  await writeCachedId(redis, key, id)
  return id
}
