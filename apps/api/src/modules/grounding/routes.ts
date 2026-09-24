import type { FastifyPluginAsync } from 'fastify'
import { query } from './service.js'
import type { QueryRequestBody } from './types.js'

const groundingRoutes: FastifyPluginAsync = async (fastify) => {
  // Unauthenticated/informational, same class as feasibility's GETs — never
  // throws (query() degrades to a template answer internally, rule 4).
  fastify.post<{ Body: QueryRequestBody }>('/query', async (request, reply) => {
    if (!request.body?.question) {
      return reply.status(400).send({ error: { message: 'question is required', code: 'BAD_REQUEST' } })
    }
    const result = await query({ db: fastify.db, redis: fastify.redis }, request.body)
    return reply.status(200).send(result)
  })
}

export default groundingRoutes
