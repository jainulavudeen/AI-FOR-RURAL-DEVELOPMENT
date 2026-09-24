import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { RedisLike } from '../../lib/redis/types'
import { env } from '../../config/env'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export interface AccessTokenClaims {
  sub: string
  phone: string
  role: string
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS })
}

const refreshKey = (token: string) => `refresh:${token}`

// Opaque, not a signed JWT — deliberately, so it's revocable (logout just
// deletes the Redis key) instead of being valid-until-expiry no matter what.
export async function issueRefreshToken(redis: RedisLike, applicantId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await redis.set(refreshKey(token), applicantId, { ex: REFRESH_TOKEN_TTL_SECONDS })
  return token
}

export async function consumeRefreshToken(redis: RedisLike, token: string): Promise<string | null> {
  return redis.get(refreshKey(token))
}

export async function revokeRefreshToken(redis: RedisLike, token: string): Promise<void> {
  await redis.del(refreshKey(token))
}
