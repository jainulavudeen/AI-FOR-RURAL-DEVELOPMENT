import { Redis as UpstashRedis } from '@upstash/redis'
import type { RedisLike } from './types.js'

// Same "degrade instead of erroring" intent as ioredisClient.ts (CLAUDE.md
// rule 4), adapted for a stateless HTTP client with no persistent-connection
// retry/backoff concept: `signal` bounds each individual request so a stuck
// fetch still fails within a few seconds (matching ioredis's
// connectTimeout: 3000), and `retry` caps how many times a failed request is
// retried before giving up (matching ioredis's maxRetriesPerRequest: 3).
// `automaticDeserialization: false` keeps `get()` returning the raw stored
// string — every call site here already does its own JSON.stringify/parse
// where needed, and Upstash's default (auto JSON.parse on read) would break
// that.
export function createUpstashClient(url: string, token: string): RedisLike {
  const client = new UpstashRedis({
    url,
    token,
    automaticDeserialization: false,
    retry: { retries: 2, backoff: (retryCount) => Math.min(retryCount * 200, 600) },
    signal: () => AbortSignal.timeout(3000),
  })

  return {
    get: (key) => client.get<string>(key),
    set: (key, value, opts) => {
      if (opts?.ex && opts.nx) return client.set(key, value, { ex: opts.ex, nx: true })
      if (opts?.ex) return client.set(key, value, { ex: opts.ex })
      if (opts?.nx) return client.set(key, value, { nx: true })
      return client.set(key, value)
    },
    del: (key) => client.del(key),
    incr: (key) => client.incr(key),
    incrby: (key, increment) => client.incrby(key, increment),
    expire: (key, seconds) => client.expire(key, seconds),
    ttl: (key) => client.ttl(key),
    quit: () => Promise.resolve(),
  }
}
