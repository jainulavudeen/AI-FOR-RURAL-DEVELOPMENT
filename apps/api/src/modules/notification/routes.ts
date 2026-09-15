import type { FastifyPluginAsync } from 'fastify'
import { sendNotImplemented } from '../../lib/notImplemented'
import type { SendRequestBody } from './types'

// Gated — see CLAUDE.md / apps/api/src/plugins/auth.ts: auth gates saving,
// appealing, and notifications, never the deterministic calculator.
const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: SendRequestBody }>('/send', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    sendNotImplemented(reply)
  })
}

export default notificationRoutes
