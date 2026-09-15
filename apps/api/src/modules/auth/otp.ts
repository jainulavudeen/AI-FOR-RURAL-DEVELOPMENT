import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env'

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

// OTP stored hashed in Redis, never in plaintext, never in Postgres. HMAC
// (not bcrypt/scrypt) is the right tool here: the security boundary is the
// short TTL + capped attempts, not hash slowness — and this stays fast on
// every request.
export function hashOtpCode(code: string): string {
  return createHmac('sha256', env.OTP_HASH_SECRET).update(code).digest('hex')
}

export function verifyOtpCode(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtpCode(code), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

export const otpKeys = {
  code: (phone: string) => `otp:code:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  lock: (phone: string) => `otp:lock:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
}
