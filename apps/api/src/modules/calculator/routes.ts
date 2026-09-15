import type { FastifyPluginAsync } from 'fastify'
import { sendNotImplemented } from '../../lib/notImplemented'
import type { EmiRequestBody, StructureRequestBody } from './types'

// Mirrors packages/core for server-side audit. Routes are stubbed — request
// validation, persistence (writing a `reports` row with its scheme_rules_version
// FK) and wiring to service.ts land in a later prompt, not here.
const calculatorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: StructureRequestBody }>('/structure', async (_request, reply) => {
    sendNotImplemented(reply)
  })

  fastify.post<{ Body: EmiRequestBody }>('/emi', async (_request, reply) => {
    sendNotImplemented(reply)
  })
}

export default calculatorRoutes
