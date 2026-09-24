import type { RedisLike } from '../lib/redis/types.js'

// Hand-rolled in-memory stand-in for a real Redis, used only in tests.
// Replaces ioredis-mock (dropped once the app stopped depending on ioredis
// directly — see lib/redis/types.ts's RedisLike) — implements the same
// narrow production surface plus the handful of test-only conveniences
// (flushall/keys/pexpire) the existing test suite already relied on.
// A plain object, not a class, so `vi.spyOn(fake, 'get')` etc. keep working
// exactly like they did against ioredis-mock.
export interface FakeRedis extends RedisLike {
  flushall(): Promise<'OK'>
  keys(pattern: string): Promise<string[]>
  pexpire(key: string, ms: number): Promise<number>
}

interface Entry {
  value: string
  expiresAt: number | null // epoch ms, null = no expiry
}

export function createFakeRedis(): FakeRedis {
  const store = new Map<string, Entry>()

  function readLive(key: string): Entry | undefined {
    const entry = store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key)
      return undefined
    }
    return entry
  }

  return {
    async get(key) {
      return readLive(key)?.value ?? null
    },
    async set(key, value, opts) {
      if (opts?.nx && readLive(key) !== undefined) return null
      const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : null
      store.set(key, { value, expiresAt })
      return 'OK'
    },
    async del(key) {
      return store.delete(key) ? 1 : 0
    },
    async incr(key) {
      const current = readLive(key)
      const next = (current ? Number(current.value) : 0) + 1
      store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null })
      return next
    },
    async expire(key, seconds) {
      const entry = readLive(key)
      if (!entry) return 0
      entry.expiresAt = Date.now() + seconds * 1000
      return 1
    },
    async pexpire(key, ms) {
      const entry = readLive(key)
      if (!entry) return 0
      entry.expiresAt = Date.now() + ms
      return 1
    },
    async ttl(key) {
      const entry = readLive(key)
      if (!entry) return -2
      if (entry.expiresAt === null) return -1
      return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000))
    },
    async keys(pattern) {
      const regex = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
      return [...store.keys()].filter((k) => readLive(k) !== undefined && regex.test(k))
    },
    async flushall() {
      store.clear()
      return 'OK'
    },
    async quit() {
      return 'OK'
    },
  }
}
