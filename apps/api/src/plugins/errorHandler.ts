import fp from 'fastify-plugin'
import type { FastifyError, FastifyPluginAsync } from 'fastify'

// Uniform error envelope. THE NON-NEGOTIABLE BOUNDARY (CLAUDE.md, rule 4):
// the app degrades instead of erroring — every error response here is a
// typed, resolved JSON body, never a hang.
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500

    // An uncaught 500 (a DB driver error, say) can carry internals in its
    // message — Drizzle/postgres.js error text includes the raw failed SQL
    // and bound parameters, which may include user-submitted free text.
    // Log it in full server-side, never echo it to the client. Deliberate
    // typed errors below 500 (ForbiddenError, NotFoundError, ...) already
    // carry a safe, purpose-written message — those pass through as-is.
    if (statusCode >= 500) {
      request.log.error(error)
    }

    reply.status(statusCode).send({
      error: {
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : (error.code ?? 'ERROR'),
      },
    })
  })
}

export default fp(errorHandlerPlugin, { name: 'error-handler' })
