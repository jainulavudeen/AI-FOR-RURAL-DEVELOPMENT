import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { applicants } from '../../db/schema'
import { logout, refreshSession, requestOtp, verifyOtp, type Applicant, type AuthDeps } from './service'
import { createSmsProvider } from './smsProvider'
import type { LogoutBody, OtpRequestBody, OtpVerifyBody, RefreshBody } from './types'

function rowToApplicant(row: { id: string; phone: string; role: string }): Applicant {
  return { id: row.id, phone: row.phone, role: row.role }
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  const smsProvider = createSmsProvider()

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

  const deps: AuthDeps = { redis: fastify.redis, smsProvider, findOrCreateApplicant, getApplicantById }

  fastify.post<{ Body: OtpRequestBody }>('/otp/request', async (request, reply) => {
    const { phone } = request.body ?? {}
    if (!phone) {
      return reply.status(400).send({ error: { message: 'phone is required', code: 'BAD_REQUEST' } })
    }

    const result = await requestOtp(deps, phone, request.ip)
    if (!result.ok) {
      const status = result.reason === 'locked' ? 423 : 429
      return reply.status(status).send({
        error: { message: result.reason, code: result.reason.toUpperCase(), retryAfterSeconds: result.retryAfterSeconds },
      })
    }
    return reply.status(202).send({ message: 'otp_sent', retryAfterSeconds: result.retryAfterSeconds })
  })

  fastify.post<{ Body: OtpVerifyBody }>('/otp/verify', async (request, reply) => {
    const { phone, code } = request.body ?? {}
    if (!phone || !code) {
      return reply.status(400).send({ error: { message: 'phone and code are required', code: 'BAD_REQUEST' } })
    }

    const result = await verifyOtp(deps, phone, code, request.ip)
    if (!result.ok) {
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

    return reply.status(200).send({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      refreshToken: result.refreshToken,
      applicant: result.applicant,
    })
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

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = request.user
    return reply.status(200).send({ id: user.sub, phone: user.phone, role: user.role })
  })
}

export default authRoutes
