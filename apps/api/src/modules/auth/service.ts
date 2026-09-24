import type { RedisLike } from '../../lib/redis/types.js'
import { checkAndIncrement, checkCooldown } from '../../lib/rateLimit.js'
import { generateOtpCode, hashOtpCode, otpKeys, verifyOtpCode } from './otp.js'
import type { SmsProvider } from './smsProvider.js'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from './tokens.js'

// Rate limits — see the plan for rationale on each number.
const RESEND_COOLDOWN_SECONDS = 60
const OTP_TTL_SECONDS = 300
const MAX_REQUESTS_PER_PHONE = 5
const REQUEST_WINDOW_SECONDS = 3600
const MAX_REQUESTS_PER_IP = 20
const MAX_VERIFY_ATTEMPTS = 5
const LOCKOUT_SECONDS = 900
const MAX_VERIFY_CALLS_PER_IP = 30
const VERIFY_WINDOW_SECONDS = 3600

export interface Applicant {
  id: string
  phone: string
  role: string
}

// Dependencies are injected rather than imported directly so the rate-limit
// and expiry paths can be tested against a fake Redis + stub applicant
// lookup, with no live Postgres required.
export interface AuthDeps {
  redis: RedisLike
  smsProvider: SmsProvider
  findOrCreateApplicant: (phone: string) => Promise<Applicant>
  getApplicantById: (id: string) => Promise<Applicant | null>
}

export type RequestOtpResult =
  | { ok: true; retryAfterSeconds: number }
  | { ok: false; reason: 'rate_limited' | 'locked'; retryAfterSeconds: number }

export async function requestOtp(deps: AuthDeps, phone: string, ip: string): Promise<RequestOtpResult> {
  const { redis } = deps

  // Locked overrides everything else — this is what stops an attacker from
  // just requesting a fresh code to reset their guess budget.
  const lockTtl = await redis.ttl(otpKeys.lock(phone))
  if (lockTtl > 0) {
    return { ok: false, reason: 'locked', retryAfterSeconds: lockTtl }
  }

  const cooldown = await checkCooldown(redis, otpKeys.cooldown(phone), RESEND_COOLDOWN_SECONDS)
  if (!cooldown.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: cooldown.retryAfterSeconds }
  }

  const phoneLimit = await checkAndIncrement(
    redis,
    `ratelimit:otp-request:phone:${phone}`,
    MAX_REQUESTS_PER_PHONE,
    REQUEST_WINDOW_SECONDS
  )
  if (!phoneLimit.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: phoneLimit.retryAfterSeconds }
  }

  const ipLimit = await checkAndIncrement(redis, `ratelimit:otp-request:ip:${ip}`, MAX_REQUESTS_PER_IP, REQUEST_WINDOW_SECONDS)
  if (!ipLimit.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: ipLimit.retryAfterSeconds }
  }

  const code = generateOtpCode()
  await redis.set(otpKeys.code(phone), hashOtpCode(code), { ex: OTP_TTL_SECONDS })
  await redis.del(otpKeys.attempts(phone))
  await deps.smsProvider.sendOtp(phone, code)

  return { ok: true, retryAfterSeconds: RESEND_COOLDOWN_SECONDS }
}

export type VerifyOtpResult =
  | { ok: true; accessToken: string; accessTokenExpiresIn: number; refreshToken: string; applicant: Applicant }
  | { ok: false; reason: 'expired_or_not_found' }
  | { ok: false; reason: 'invalid_code'; attemptsRemaining: number }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number }

export async function verifyOtp(deps: AuthDeps, phone: string, code: string, ip: string): Promise<VerifyOtpResult> {
  const { redis } = deps

  const ipLimit = await checkAndIncrement(redis, `ratelimit:otp-verify:ip:${ip}`, MAX_VERIFY_CALLS_PER_IP, VERIFY_WINDOW_SECONDS)
  if (!ipLimit.allowed) {
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: ipLimit.retryAfterSeconds }
  }

  const lockTtl = await redis.ttl(otpKeys.lock(phone))
  if (lockTtl > 0) {
    return { ok: false, reason: 'locked', retryAfterSeconds: lockTtl }
  }

  const storedHash = await redis.get(otpKeys.code(phone))
  if (!storedHash) {
    return { ok: false, reason: 'expired_or_not_found' }
  }

  if (!verifyOtpCode(code, storedHash)) {
    const attempts = await redis.incr(otpKeys.attempts(phone))
    const codeTtl = await redis.ttl(otpKeys.code(phone))
    await redis.expire(otpKeys.attempts(phone), codeTtl > 0 ? codeTtl : OTP_TTL_SECONDS)

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await redis.set(otpKeys.lock(phone), '1', { ex: LOCKOUT_SECONDS })
      await redis.del(otpKeys.code(phone))
      await redis.del(otpKeys.attempts(phone))
      return { ok: false, reason: 'locked', retryAfterSeconds: LOCKOUT_SECONDS }
    }

    return { ok: false, reason: 'invalid_code', attemptsRemaining: MAX_VERIFY_ATTEMPTS - attempts }
  }

  // Success — consume the code immediately so it can't be replayed.
  await redis.del(otpKeys.code(phone))
  await redis.del(otpKeys.attempts(phone))
  await redis.del(otpKeys.cooldown(phone))

  const applicant = await deps.findOrCreateApplicant(phone)
  const accessToken = signAccessToken({ sub: applicant.id, phone: applicant.phone, role: applicant.role })
  const refreshToken = await issueRefreshToken(redis, applicant.id)

  return { ok: true, accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshToken, applicant }
}

export type RefreshResult = { ok: true; accessToken: string; accessTokenExpiresIn: number } | { ok: false }

export async function refreshSession(deps: AuthDeps, refreshToken: string): Promise<RefreshResult> {
  const applicantId = await consumeRefreshToken(deps.redis, refreshToken)
  if (!applicantId) return { ok: false }

  const applicant = await deps.getApplicantById(applicantId)
  if (!applicant) return { ok: false }

  const accessToken = signAccessToken({ sub: applicant.id, phone: applicant.phone, role: applicant.role })
  return { ok: true, accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

export async function logout(deps: AuthDeps, refreshToken: string): Promise<void> {
  await revokeRefreshToken(deps.redis, refreshToken)
}
