import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { env } from '../config/env.js'
import type { RedisLike } from '../lib/redis/types.js'
import { createIoredisClient } from '../lib/redis/ioredisClient.js'
import { createUpstashClient } from '../lib/redis/upstashClient.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisLike
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  // REDIS_PROVIDER follows this codebase's established mock/real-style
  // provider-switch pattern (LLM_PROVIDER, AGMARKNET_PROVIDER, etc.):
  // `ioredis` (default) is a persistent TCP client for local dev via
  // docker-compose and any long-running deploy target; `upstash` is a
  // stateless HTTP client for Vercel serverless functions, where a
  // persistent TCP connection per invocation doesn't behave reliably.
  const redis: RedisLike =
    env.REDIS_PROVIDER === 'upstash'
      ? createUpstashClient(env.UPSTASH_REDIS_REST_URL!, env.UPSTASH_REDIS_REST_TOKEN!)
      : createIoredisClient(env.REDIS_URL!)

  fastify.decorate('redis', redis)
  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })
