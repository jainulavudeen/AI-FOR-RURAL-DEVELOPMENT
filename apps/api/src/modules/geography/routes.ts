import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { blocks, districts } from '../../db/schema/index.js'
import { getBlocks, getDistricts, getStates, type GeographyDeps } from './service.js'

const STATES_MAX_AGE = 7 * 24 * 60 * 60 // 7d — 35 states, essentially static reference data
const DISTRICTS_MAX_AGE = 7 * 24 * 60 * 60
const BLOCKS_MAX_AGE = 7 * 24 * 60 * 60

// A slug ("madurai_north") back to a display name ("Madurai North") —
// there's no separate stored display-name column for districts/blocks
// (only states have one, `districts.stateName`), so this is derived at
// read time. Deterministic and reversible for the vast majority of real
// Census names; a handful of all-caps/initialism names (e.g. "NCT OF
// DELHI") title-case imperfectly ("Nct Of Delhi") — a cosmetic gap, not a
// correctness one, and not worth a schema migration to fix.
function humanizeSlug(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Real, nationwide administrative reference data — see
// ingestion/adminHierarchy/ for the source (SHRUG's Census 2011
// redistribution) and CLAUDE.md item 8+9 for why this exists: real block
// names ("Melur"), not numbered placeholders ("Block I"). Every route is
// unauthenticated/public, same class as feasibility's other reference
// GETs — this is static geography, not personal data. `code IS NOT NULL`
// filters out the old placeholder rows (block_1/block_2/block_3, and a
// couple of pre-nationwide-ingestion duplicate block names) that predate
// this ingestion and were never assigned a real code.
const geographyRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: GeographyDeps = {
    listStates: async () => {
      const rows = await fastify.db
        .selectDistinct({ stateCode: districts.stateCode, stateName: districts.stateName })
        .from(districts)
        .where(isNotNull(districts.code))
        .orderBy(asc(districts.stateName))
      return rows.map((r) => ({ id: r.stateCode, name: r.stateName }))
    },
    listDistricts: async (stateId: string) => {
      const rows = await fastify.db
        .select({ id: districts.id, name: districts.name })
        .from(districts)
        .where(and(eq(districts.stateCode, stateId), isNotNull(districts.code)))
        .orderBy(asc(districts.name))
      return rows.map((r) => ({ id: r.name, uuid: r.id, name: humanizeSlug(r.name) }))
    },
    listBlocks: async (districtUuid: string) => {
      const rows = await fastify.db
        .select({ id: blocks.id, name: blocks.name })
        .from(blocks)
        .where(and(eq(blocks.districtId, districtUuid), isNotNull(blocks.code)))
        .orderBy(asc(blocks.name))
      // uuid is additive (the Admin Portal's officer-jurisdiction picker
      // needs a real block id); the Wizard keeps using the name `id`.
      return rows.map((r) => ({ id: r.name, uuid: r.id, name: humanizeSlug(r.name) }))
    },
  }

  fastify.get('/states', async (_request, reply) => {
    const states = await getStates(deps)
    return reply.header('Cache-Control', `public, max-age=${STATES_MAX_AGE}`).status(200).send(states)
  })

  fastify.get<{ Querystring: { stateId?: string } }>('/districts', async (request, reply) => {
    const districtsList = await getDistricts(deps, request.query.stateId ?? '')
    return reply.header('Cache-Control', `public, max-age=${DISTRICTS_MAX_AGE}`).status(200).send(districtsList)
  })

  fastify.get<{ Querystring: { districtUuid?: string } }>('/blocks', async (request, reply) => {
    const blocksList = await getBlocks(deps, request.query.districtUuid ?? '')
    return reply.header('Cache-Control', `public, max-age=${BLOCKS_MAX_AGE}`).status(200).send(blocksList)
  })
}

export default geographyRoutes
