import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { applicants } from '../db/schema/index.js'
import type { AccessTokenClaims } from '../modules/auth/tokens.js'

export type Role = 'applicant' | 'officer' | 'admin'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    // authenticate + "the DB says this account holds one of these roles".
    // Use on every route that is role-specific; use plain authenticate
    // only where any signed-in account may call it (and the service layer
    // still checks ownership).
    requireRole: (...roles: Role[]) => preHandlerAsyncHookHandler
  }
  interface FastifyRequest {
    user: AccessTokenClaims
  }
}

// A preHandler other modules opt into per-route — nothing is globally
// gated. THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md): auth failure must never
// block the deterministic calculator, so calculator/feasibility/
// geography/grounding reference routes never use this.
//
// Role comes from the database, never from the client: the JWT proves WHO
// is calling, then the applicants row is re-read on every authenticated
// request and its role/active flag overwrite whatever the token carried.
// So an admin deactivating an officer, or changing a role, takes effect
// on the very next request rather than when a 15-minute token expires.
// One primary-key lookup per authenticated request — cheap at this scale.
const authPlugin: FastifyPluginAsync = async (fastify) => {
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) {
      return reply.status(401).send({ error: { message: 'Missing bearer token', code: 'UNAUTHENTICATED' } })
    }

    let claims: AccessTokenClaims
    try {
      claims = jwt.verify(token, env.JWT_SECRET) as AccessTokenClaims
    } catch {
      return reply.status(401).send({ error: { message: 'Invalid or expired token', code: 'UNAUTHENTICATED' } })
    }

    const [row] = await fastify.db
      .select({ role: applicants.role, active: applicants.active, phone: applicants.phone })
      .from(applicants)
      .where(eq(applicants.id, claims.sub))
      .limit(1)
    if (!row) {
      return reply.status(401).send({ error: { message: 'Account not found', code: 'UNAUTHENTICATED' } })
    }
    if (!row.active) {
      return reply.status(403).send({ error: { message: 'This account has been deactivated', code: 'ACCOUNT_DEACTIVATED' } })
    }
    request.user = { sub: claims.sub, phone: row.phone, role: row.role }
  }

  fastify.decorate('authenticate', authenticate)

  fastify.decorate('requireRole', (...roles: Role[]): preHandlerAsyncHookHandler => {
    return async function (request, reply) {
      await authenticate(request, reply)
      if (reply.sent) return
      if (!roles.includes(request.user.role as Role)) {
        return reply
          .status(403)
          .send({ error: { message: `This action requires role: ${roles.join(' or ')}`, code: 'FORBIDDEN' } })
      }
    }
  })
}

export default fp(authPlugin, { name: 'auth', dependencies: ['db'] })
