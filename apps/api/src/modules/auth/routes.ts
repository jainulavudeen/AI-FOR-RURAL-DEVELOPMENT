import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { env } from '../../config/env.js'
import { applicants } from '../../db/schema/index.js'
import { createGoogleVerifier, type GoogleVerifyResult } from './googleVerifier.js'
import {
  linkGoogle,
  linkPhone,
  logout,
  refreshSession,
  requestOtp,
  signInWithGoogle,
  verifyOtp,
  type Applicant,
  type AuthDeps,
  type OtpCheckFailure,
} from './service.js'
import { createSmsProvider } from './smsProvider.js'
import type { GoogleSignInBody, LinkPhoneBody, LogoutBody, OtpRequestBody, OtpVerifyBody, RefreshBody } from './types.js'

export function rowToApplicant(row: typeof applicants.$inferSelect): Applicant {
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    email: row.email,
    displayName: row.displayName,
    designation: row.designation,
    active: row.active,
    hasGoogle: row.googleSub !== null,
  }
}

// What the client is allowed to know about the signed-in account. Never
// includes google_sub or invite state.
function publicProfile(a: Applicant) {
  return {
    id: a.id,
    phone: a.phone,
    email: a.email ?? null,
    displayName: a.displayName ?? null,
    designation: a.designation ?? null,
    role: a.role,
    hasGoogle: Boolean(a.hasGoogle),
    hasPhone: Boolean(a.phone),
  }
}

function sendOtpFailure(reply: FastifyReply, result: OtpCheckFailure) {
  if (result.reason === 'expired_or_not_found') {
    return reply.status(400).send({ error: { message: 'OTP expired or not found', code: 'OTP_EXPIRED_OR_NOT_FOUND' } })
  }
  if (result.reason === 'invalid_code') {
    return reply
      .status(401)
      .send({ error: { message: 'Invalid code', code: 'INVALID_OTP', attemptsRemaining: result.attemptsRemaining } })
  }
  if (result.reason === 'locked') {
    return reply
      .status(423)
      .send({ error: { message: 'Too many attempts', code: 'LOCKED', retryAfterSeconds: result.retryAfterSeconds } })
  }
  return reply
    .status(429)
    .send({ error: { message: 'Rate limited', code: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds } })
}

function sendGoogleFailure(reply: FastifyReply, result: Extract<GoogleVerifyResult, { ok: false }>) {
  if (result.reason === 'not_configured') {
    return reply.status(503).send({ error: { message: 'Google sign-in is not configured', code: 'GOOGLE_NOT_CONFIGURED' } })
  }
  if (result.reason === 'email_not_verified') {
    return reply.status(401).send({ error: { message: 'Google email is not verified', code: 'GOOGLE_EMAIL_UNVERIFIED' } })
  }
  return reply.status(401).send({ error: { message: 'Invalid Google credential', code: 'GOOGLE_INVALID_TOKEN' } })
}

const DEACTIVATED = { error: { message: 'This account has been deactivated', code: 'ACCOUNT_DEACTIVATED' } }

// Loose E.164 check — just enough to reject obviously malformed input (typos,
// missing country code, non-numeric junk) before it reaches the SMS provider.
// Not a full national-format validator; the frontend already enforces the
// stricter +91-and-10-digits shape for this app's actual users.
const PHONE_FORMAT = /^\+[1-9]\d{7,14}$/

function sendLinkFailure(reply: FastifyReply, reason: 'already_linked_elsewhere' | 'already_has_method' | 'not_found') {
  if (reason === 'already_linked_elsewhere') {
    return reply.status(409).send({
      error: { message: 'That sign-in method already belongs to another account', code: 'ALREADY_LINKED_ELSEWHERE' },
    })
  }
  if (reason === 'already_has_method') {
    return reply.status(409).send({
      error: { message: 'This account already has a different one linked', code: 'ALREADY_HAS_METHOD' },
    })
  }
  return reply.status(401).send({ error: { message: 'Account not found', code: 'UNAUTHENTICATED' } })
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const smsProvider = createSmsProvider()
  const verifyGoogleIdToken = createGoogleVerifier()

  const findOrCreateApplicant: AuthDeps['findOrCreateApplicant'] = async (phone) => {
    const [row] = await fastify.db
      .insert(applicants)
      .values({ phone, phoneVerifiedAt: new Date() })
      .onConflictDoUpdate({
        target: applicants.phone,
        set: { phoneVerifiedAt: new Date() },
      })
      .returning()
    if (!row) throw new Error('Failed to upsert applicant')
    return rowToApplicant(row)
  }

  const getApplicantById: AuthDeps['getApplicantById'] = async (id) => {
    const [row] = await fastify.db.select().from(applicants).where(eq(applicants.id, id)).limit(1)
    return row ? rowToApplicant(row) : null
  }

  const findOne = async (where: ReturnType<typeof eq>) => {
    const [row] = await fastify.db.select().from(applicants).where(where).limit(1)
    return row ? rowToApplicant(row) : null
  }

  const deps: AuthDeps = {
    redis: fastify.redis,
    smsProvider,
    findOrCreateApplicant,
    getApplicantById,
    findByGoogleSub: (sub) => findOne(eq(applicants.googleSub, sub)),
    findByPhone: (phone) => findOne(eq(applicants.phone, phone)),
    claimInviteByEmail: async (identity) => {
      const [row] = await fastify.db
        .update(applicants)
        .set({
          googleSub: identity.sub,
          email: identity.email,
          invitedEmail: null,
          updatedAt: new Date(),
        })
        .where(and(eq(applicants.invitedEmail, identity.email), isNull(applicants.googleSub)))
        .returning()
      if (!row) return null
      // Keep an admin-entered display name; only fill it if blank.
      if (!row.displayName && identity.name) {
        const [named] = await fastify.db
          .update(applicants)
          .set({ displayName: identity.name })
          .where(eq(applicants.id, row.id))
          .returning()
        return rowToApplicant(named ?? row)
      }
      return rowToApplicant(row)
    },
    createGoogleApplicant: async (identity) => {
      // role is left to the column default ('applicant') — self-signup can
      // never produce anything else.
      const [row] = await fastify.db
        .insert(applicants)
        .values({ googleSub: identity.sub, email: identity.email, displayName: identity.name })
        .onConflictDoUpdate({ target: applicants.googleSub, set: { email: identity.email } })
        .returning()
      if (!row) throw new Error('Failed to create Google applicant')
      return rowToApplicant(row)
    },
    attachGoogle: async (applicantId, identity) => {
      const [row] = await fastify.db
        .update(applicants)
        .set({ googleSub: identity.sub, email: identity.email, updatedAt: new Date() })
        .where(and(eq(applicants.id, applicantId), isNull(applicants.googleSub)))
        .returning()
      if (!row) throw new Error('Failed to link Google account')
      if (!row.displayName && identity.name) {
        await fastify.db.update(applicants).set({ displayName: identity.name }).where(eq(applicants.id, applicantId))
      }
      return rowToApplicant({ ...row, displayName: row.displayName ?? identity.name })
    },
    attachPhone: async (applicantId, phone) => {
      const [row] = await fastify.db
        .update(applicants)
        .set({ phone, phoneVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(applicants.id, applicantId))
        .returning()
      if (!row) throw new Error('Failed to link phone')
      return rowToApplicant(row)
    },
  }

  // Public: tells the sign-in page whether to render the Google button.
  // A client id is not a secret (it's embedded in every GIS page).
  fastify.get('/config', async (_request, reply) => {
    return reply.status(200).send({ googleClientId: env.GOOGLE_OAUTH_CLIENT_ID ?? null })
  })

  fastify.post<{ Body: OtpRequestBody }>('/otp/request', async (request, reply) => {
    const { phone } = request.body ?? {}
    if (!phone) {
      return reply.status(400).send({ error: { message: 'phone is required', code: 'BAD_REQUEST' } })
    }
    if (!PHONE_FORMAT.test(phone)) {
      return reply.status(400).send({ error: { message: 'phone is not a valid number', code: 'INVALID_PHONE' } })
    }

    const result = await requestOtp(deps, phone, request.ip)
    if (!result.ok) {
      const status = result.reason === 'locked' ? 423 : 429
      return reply.status(status).send({
        error: { message: result.reason, code: result.reason.toUpperCase(), retryAfterSeconds: result.retryAfterSeconds },
      })
    }
    // deliveryMode tells the client which SMS path actually ran — the
    // default 'console' provider only logs the code server-side and never
    // reaches a real phone, which otherwise looks identical to a real send
    // from this response alone (see CLAUDE.md boundary rule 4: degrade
    // honestly, don't let a demo default masquerade as success).
    return reply
      .status(202)
      .send({ message: 'otp_sent', retryAfterSeconds: result.retryAfterSeconds, deliveryMode: env.SMS_PROVIDER })
  })

  fastify.post<{ Body: OtpVerifyBody }>('/otp/verify', async (request, reply) => {
    const { phone, code } = request.body ?? {}
    if (!phone || !code) {
      return reply.status(400).send({ error: { message: 'phone and code are required', code: 'BAD_REQUEST' } })
    }

    const result = await verifyOtp(deps, phone, code, request.ip)
    if (!result.ok) {
      if (result.reason === 'deactivated') return reply.status(403).send(DEACTIVATED)
      return sendOtpFailure(reply, result)
    }

    return reply.status(200).send({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      applicant: publicProfile(result.applicant),
    })
  })

  // Google sign-in: the body carries ONLY the opaque GIS credential (an
  // ID token). Identity is whatever Google's verified token says, never
  // anything else in the request.
  fastify.post<{ Body: GoogleSignInBody }>('/google', async (request, reply) => {
    const { credential } = request.body ?? {}
    if (!credential) {
      return reply.status(400).send({ error: { message: 'credential is required', code: 'BAD_REQUEST' } })
    }
    const verified = await verifyGoogleIdToken(credential)
    if (!verified.ok) return sendGoogleFailure(reply, verified)

    const result = await signInWithGoogle(deps, verified.identity)
    if (!result.ok) return reply.status(403).send(DEACTIVATED)
    return reply.status(200).send({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      applicant: publicProfile(result.applicant),
    })
  })

  // Add Google to the signed-in account. 409 if that Gmail already
  // belongs to another account — never a silent merge or duplicate.
  fastify.post<{ Body: GoogleSignInBody }>('/link/google', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { credential } = request.body ?? {}
    if (!credential) {
      return reply.status(400).send({ error: { message: 'credential is required', code: 'BAD_REQUEST' } })
    }
    const verified = await verifyGoogleIdToken(credential)
    if (!verified.ok) return sendGoogleFailure(reply, verified)

    const result = await linkGoogle(deps, request.user.sub, verified.identity)
    if (!result.ok) return sendLinkFailure(reply, result.reason)
    return reply.status(200).send(publicProfile(result.applicant))
  })

  // Add a phone to the signed-in account: request a code with the normal
  // /otp/request, then prove it here.
  fastify.post<{ Body: LinkPhoneBody }>('/link/phone', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { phone, code } = request.body ?? {}
    if (!phone || !code) {
      return reply.status(400).send({ error: { message: 'phone and code are required', code: 'BAD_REQUEST' } })
    }
    if (!PHONE_FORMAT.test(phone)) {
      return reply.status(400).send({ error: { message: 'phone is not a valid number', code: 'INVALID_PHONE' } })
    }
    const result = await linkPhone(deps, request.user.sub, phone, code, request.ip)
    if (!result.ok) {
      switch (result.reason) {
        case 'already_linked_elsewhere':
        case 'already_has_method':
        case 'not_found':
          return sendLinkFailure(reply, result.reason)
        default:
          return sendOtpFailure(reply, result)
      }
    }
    return reply.status(200).send(publicProfile(result.applicant))
  })

  fastify.post<{ Body: RefreshBody }>('/refresh', async (request, reply) => {
    const { refreshToken } = request.body ?? {}
    if (!refreshToken) {
      return reply.status(400).send({ error: { message: 'refreshToken is required', code: 'BAD_REQUEST' } })
    }

    const result = await refreshSession(deps, refreshToken)
    if (!result.ok) {
      return reply.status(401).send({ error: { message: 'Invalid or expired refresh token', code: 'UNAUTHENTICATED' } })
    }
    return reply.status(200).send({ accessToken: result.accessToken, accessTokenExpiresIn: result.accessTokenExpiresIn })
  })

  fastify.post<{ Body: LogoutBody }>('/logout', async (request, reply) => {
    const { refreshToken } = request.body ?? {}
    if (refreshToken) {
      await logout(deps, refreshToken)
    }
    return reply.status(204).send()
  })

  // The authoritative profile — role straight from the DB row. The web
  // re-reads this on load so a role changed by an admin (or an officer
  // deactivated) takes effect without waiting for the token to expire.
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const applicant = await getApplicantById(request.user.sub)
    if (!applicant) return reply.status(401).send({ error: { message: 'Account not found', code: 'UNAUTHENTICATED' } })
    return reply.status(200).send(publicProfile(applicant))
  })
}

export default authRoutes
