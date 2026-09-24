import { asc, eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { businessTypes } from '../../db/schema/index.js'
import { listBusinessTypes, type BusinessTypeRecord, type BusinessTypesDeps } from './service.js'

// Public, unauthenticated — reference/catalogue data, same class as
// feasibility's informational GETs (CLAUDE.md: auth only gates saving,
// appealing, notifications). apps/web's data/businesses.js stays the
// static default the offline Wizard renders instantly from; this is the
// versioned DB source of truth a non-blocking client overlay enriches
// from once/if it resolves — never a hard dependency.
const businessTypesRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: BusinessTypesDeps = {
    getActiveBusinessTypes: async (): Promise<BusinessTypeRecord[]> => {
      const rows = await fastify.db
        .select()
        .from(businessTypes)
        .where(eq(businessTypes.active, true))
        .orderBy(asc(businessTypes.id))
      return rows.map((row) => ({ id: row.id, icon: row.icon, nameKey: row.nameKey, descKey: row.descKey, baseScore: row.baseScore }))
    },
  }

  fastify.get('/', async (_request, reply) => {
    const types = await listBusinessTypes(deps)
    return reply.status(200).send(types)
  })
}

export default businessTypesRoutes
