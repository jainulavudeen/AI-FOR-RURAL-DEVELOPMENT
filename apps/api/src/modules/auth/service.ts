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
  phone: string | null
  role: string
  email?: string | null
  displayName?: string | null
  designation?: string | null
  // Omitted = active (keeps simple test stubs short). false = deactivated
  // by an admin: sign-in and refresh are both refused.
  active?: boolean
  hasGoogle?: boolean
}

// A Google ID token that the SERVER has already verified (signature,
// audience, expiry, email_verified — see googleVerifier.ts). Nothing in
// this file ever accepts identity claims straight from the client.
export interface VerifiedGoogleIdentity {
  sub: string
  email: string
  name: string | null
}

// Dependencies are injected rather than imported directly so the rate-limit
// and expiry paths can be tested against a fake Redis + stub applicant
// lookup, with no live Postgres required.
export interface AuthDeps {
  redis: RedisLike
  smsProvider: SmsProvider
  // Self-registration by phone always creates role 'applicant'. A phone
  // an admin already invited as an officer just finds that existing row.
  findOrCreateApplicant: (phone: string) => Promise<Applicant>
  getApplicantById: (id: string) => Promise<Applicant | null>
  // Google + account linking. Optional so the phone-only test harness
  // doesn't have to stub them; the real routes always provide all four.
  findByGoogleSub?: (sub: string) => Promise<Applicant | null>
  findByPhone?: (phone: string) => Promise<Applicant | null>
  // Claims a pending admin invite (applicants.invited_email) for exactly
  // this verified email, attaching the Google identity to it. null if no
  // invite exists.
  claimInviteByEmail?: (identity: VerifiedGoogleIdentity) => Promise<Applicant | null>
  createGoogleApplicant?: (identity: VerifiedGoogleIdentity) => Promise<Applicant>
  attachGoogle?: (applicantId: string, identity: VerifiedGoogleIdentity) => Promise<Applicant>
  attachPhone?: (applicantId: string, phone: string) => Promise<Applicant>
}

function requireDep<T>(dep: T | undefined, name: string): T {
  if (!dep) throw new Error(`AuthDeps.${name} is required for this operation`)
  return dep
}

export interface IssuedSession {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  applicant: Applicant
}

async function issueSession(deps: AuthDeps, applicant: Applicant): Promise<IssuedSession> {
  const accessToken = signAccessToken({ sub: applicant.id, phone: applicant.phone, role: applicant.role })
  const refreshToken = await issueRefreshToken(deps.redis, applicant.id)
  return { accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS, refreshToken, applicant }
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

export type OtpCheckFailure =
  | { ok: false; reason: 'expired_or_not_found' }
  | { ok: false; reason: 'invalid_code'; attemptsRemaining: number }
  | { ok: false; reason: 'locked'; retryAfterSeconds: number }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number }

export type VerifyOtpResult =
  | ({ ok: true } & IssuedSession)
  | OtpCheckFailure
  | { ok: false; reason: 'deactivated' }

// The shared "is this the right code for this phone" step — rate limits,
// lockout, single-use consumption — used both by sign-in (verifyOtp) and by
// adding a phone to an already-signed-in account (linkPhone), so linking
// can't become a weaker path around the same guess budget.
async function checkOtp(deps: AuthDeps, phone: string, code: string, ip: string): Promise<{ ok: true } | OtpCheckFailure> {
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
  return { ok: true }
}

export async function verifyOtp(deps: AuthDeps, phone: string, code: string, ip: string): Promise<VerifyOtpResult> {
  const check = await checkOtp(deps, phone, code, ip)
  if (!check.ok) return check

  const applicant = await deps.findOrCreateApplicant(phone)
  if (applicant.active === false) return { ok: false, reason: 'deactivated' }
  return { ok: true, ...(await issueSession(deps, applicant)) }
}

export type GoogleSignInResult = ({ ok: true; created: boolean } & IssuedSession) | { ok: false; reason: 'deactivated' }

// Sign in with an already-server-verified Google identity. Match order:
//  1. an account that already has this google_sub (a returning user —
//     including a phone account that linked this Gmail earlier, so it
//     never duplicates);
//  2. a pending admin invite for exactly this verified email (an officer
//     or the bootstrap admin, claiming their pre-created account);
//  3. otherwise a brand-new account, always role 'applicant'.
// There is deliberately no step that matches a phone account by email —
// phone accounts carry no email, and guessing would let anyone who
// controls a Gmail take over someone else's account.
export async function signInWithGoogle(deps: AuthDeps, identity: VerifiedGoogleIdentity): Promise<GoogleSignInResult> {
  let applicant = await requireDep(deps.findByGoogleSub, 'findByGoogleSub')(identity.sub)
  let created = false
  if (!applicant) applicant = await requireDep(deps.claimInviteByEmail, 'claimInviteByEmail')(identity)
  if (!applicant) {
    applicant = await requireDep(deps.createGoogleApplicant, 'createGoogleApplicant')(identity)
    created = true
  }
  if (applicant.active === false) return { ok: false, reason: 'deactivated' }
  return { ok: true, created, ...(await issueSession(deps, applicant)) }
}

export type LinkResult =
  | { ok: true; applicant: Applicant }
  | { ok: false; reason: 'already_linked_elsewhere' | 'already_has_method' | 'not_found' }

// Adds Google to an account that is already signed in (by phone). Refused
// if this Google identity already belongs to a different account — the
// user should sign in with it instead; accounts are never merged
// automatically — or if this account already has a different Google
// identity attached.
export async function linkGoogle(deps: AuthDeps, applicantId: string, identity: VerifiedGoogleIdentity): Promise<LinkResult> {
  const owner = await requireDep(deps.findByGoogleSub, 'findByGoogleSub')(identity.sub)
  if (owner && owner.id !== applicantId) return { ok: false, reason: 'already_linked_elsewhere' }
  if (owner && owner.id === applicantId) return { ok: true, applicant: owner }

  const me = await deps.getApplicantById(applicantId)
  if (!me) return { ok: false, reason: 'not_found' }
  if (me.hasGoogle) return { ok: false, reason: 'already_has_method' }
  return { ok: true, applicant: await requireDep(deps.attachGoogle, 'attachGoogle')(applicantId, identity) }
}

export type LinkPhoneResult = LinkResult | OtpCheckFailure

// Adds a phone to an account that is already signed in (by Google),
// proving possession with the same OTP flow and guess budget as sign-in.
export async function linkPhone(deps: AuthDeps, applicantId: string, phone: string, code: string, ip: string): Promise<LinkPhoneResult> {
  const me = await deps.getApplicantById(applicantId)
  if (!me) return { ok: false, reason: 'not_found' }
  if (me.phone && me.phone !== phone) return { ok: false, reason: 'already_has_method' }

  // OTP first, ownership second — so this endpoint can't be used to probe
  // which phone numbers have accounts without controlling the phone.
  const check = await checkOtp(deps, phone, code, ip)
  if (!check.ok) return check
  if (me.phone === phone) return { ok: true, applicant: me }

  const owner = await requireDep(deps.findByPhone, 'findByPhone')(phone)
  if (owner && owner.id !== applicantId) return { ok: false, reason: 'already_linked_elsewhere' }
  return { ok: true, applicant: await requireDep(deps.attachPhone, 'attachPhone')(applicantId, phone) }
}

export type RefreshResult = { ok: true; accessToken: string; accessTokenExpiresIn: number } | { ok: false }

export async function refreshSession(deps: AuthDeps, refreshToken: string): Promise<RefreshResult> {
  const applicantId = await consumeRefreshToken(deps.redis, refreshToken)
  if (!applicantId) return { ok: false }

  const applicant = await deps.getApplicantById(applicantId)
  if (!applicant || applicant.active === false) return { ok: false }

  const accessToken = signAccessToken({ sub: applicant.id, phone: applicant.phone, role: applicant.role })
  return { ok: true, accessToken, accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

export async function logout(deps: AuthDeps, refreshToken: string): Promise<void> {
  await revokeRefreshToken(deps.redis, refreshToken)
}
