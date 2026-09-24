import type { RedisLike } from './redis/types.js'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

// Fixed-window counter: INCR the key, set its expiry only on the first hit
// in the window. Simple and sufficient at this scale — no need for a
// sliding-window / token-bucket implementation.
export async function checkAndIncrement(
  redis: RedisLike,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  const ttl = await redis.ttl(key)
  const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  }
}

export interface CooldownResult {
  allowed: boolean
  retryAfterSeconds: number
}

// SET ... NX EX — a simple "may not repeat within N seconds" gate, used for
// the OTP resend cooldown (separate from the hourly request cap above).
export async function checkCooldown(redis: RedisLike, key: string, windowSeconds: number): Promise<CooldownResult> {
  const set = await redis.set(key, '1', { ex: windowSeconds, nx: true })
  if (set === 'OK') return { allowed: true, retryAfterSeconds: 0 }
  const ttl = await redis.ttl(key)
  return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds }
}
