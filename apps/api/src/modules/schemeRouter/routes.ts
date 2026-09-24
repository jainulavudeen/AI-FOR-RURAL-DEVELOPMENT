import type { FastifyPluginAsync } from 'fastify'
import { sendNotImplemented } from '../../lib/notImplemented.js'
import type { MatchRequestBody } from './types.js'

const schemeRouterRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: MatchRequestBody }>('/match', async (_request, reply) => {
    sendNotImplemented(reply)
  })
}

export default schemeRouterRoutes
