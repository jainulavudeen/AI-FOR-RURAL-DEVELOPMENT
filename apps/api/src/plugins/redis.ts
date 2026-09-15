import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import Redis from 'ioredis'
import { env } from '../config/env'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  // THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md, rule 4): the app degrades
  // instead of erroring — a spinner that never resolves is not acceptable.
  // ioredis's own defaults (maxRetriesPerRequest: 20, unbounded backoff
  // growth) were observed to leave a queued command pending well past a
  // minute once the connection had failed repeatedly — bounded here so a
  // command issued while Redis is unreachable fails within a few seconds,
  // not indefinitely.
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 1000),
    connectTimeout: 3000,
  })
  fastify.decorate('redis', redis)
  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })
