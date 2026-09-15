import type { FastifyReply } from 'fastify'

export function sendNotImplemented(reply: FastifyReply) {
  return reply.status(501).send({
    error: { message: 'Not implemented yet', code: 'NOT_IMPLEMENTED' },
  })
}
