import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { AccessTokenClaims } from '../modules/auth/tokens'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: AccessTokenClaims
  }
}

// A preHandler other modules opt into per-route — nothing is globally
// gated. THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md): auth failure must never
// block the deterministic calculator, so calculator/feasibility/
// schemeRouter/grounding never use this. It guards feedback (flag/appeal)
// and notification (send) — "auth only gates saving, appealing, and
// notifications."
const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return reply.status(401).send({ error: { message: 'Missing bearer token', code: 'UNAUTHENTICATED' } })
    }

    try {
      request.user = jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims
    } catch {
      return reply.status(401).send({ error: { message: 'Invalid or expired token', code: 'UNAUTHENTICATED' } })
    }
  })
}

export default fp(authPlugin, { name: 'auth' })
