import { Redis } from 'ioredis'
import type { RedisLike } from './types.js'

// THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md, rule 4): the app degrades instead
// of erroring — a spinner that never resolves is not acceptable. ioredis's
// own defaults (maxRetriesPerRequest: 20, unbounded backoff growth) were
// observed to leave a queued command pending well past a minute once the
// connection had failed repeatedly — bounded here so a command issued while
// Redis is unreachable fails within a few seconds, not indefinitely.
export function createIoredisClient(redisUrl: string): RedisLike {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 1000),
    connectTimeout: 3000,
  })

  return {
    get: (key) => client.get(key),
    set: (key, value, opts) => {
      if (opts?.ex && opts.nx) return client.set(key, value, 'EX', opts.ex, 'NX')
      if (opts?.ex) return client.set(key, value, 'EX', opts.ex)
      if (opts?.nx) return client.set(key, value, 'NX')
      return client.set(key, value)
    },
    del: (key) => client.del(key),
    incr: (key) => client.incr(key),
    expire: (key, seconds) => client.expire(key, seconds),
    ttl: (key) => client.ttl(key),
    quit: () => client.quit(),
  }
}
