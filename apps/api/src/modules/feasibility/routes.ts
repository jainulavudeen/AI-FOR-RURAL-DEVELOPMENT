import type { FastifyPluginAsync } from 'fastify'
import { DigipinOutOfBoundsError, encodeDigipin } from '../../ingestion/digipin/algorithm'
import { narrateReport } from '../grounding/service'
import { createAgmarknetProvider } from './agmarknetProvider'
import { getCachedBlockId, getCachedDistrictId } from './districtBlockCache'
import { createGeocodingProvider } from './geocodingProvider'
import { getPeerBenchmark } from './peerBenchmark'
import { assembleFeasibilityScore, getInformalLendingRate, getLocalDemandSignal } from './service'
import type { ScoreRequestBody } from './types'

// Cache lifetimes mirror each signal's own real freshness window (not
// arbitrary) — see districtBlockCache.ts and agmarknetCache.ts for the
// Redis-side TTLs these headers are kept in sync with.
const DISTRICT_REFERENCE_MAX_AGE = 24 * 60 * 60 // 24h — district/block names are static reference data
const LOCAL_DEMAND_MAX_AGE = 6 * 60 * 60 // 6h — matches agmarknetCache.ts's FRESH_SECONDS
const INFORMAL_RATE_MAX_AGE = 24 * 60 * 60 // 24h — a seeded regional estimate, rarely updated
const PEER_BENCHMARK_MAX_AGE = 60 * 60 // 1h — aggregate stat that shifts as more reports accrue

const feasibilityRoutes: FastifyPluginAsync = async (fastify) => {
  const agmarknetProvider = createAgmarknetProvider()
  const geocodingProvider = createGeocodingProvider()

  // Unauthenticated/informational, same class as the GETs below. Resolves
  // the client's mock district/block slugs to real DB rows (only Madurai's
  // seeded placeholder blocks will ever resolve today — see CLAUDE.md's
  // naming-scheme gap), then assembles the real composite score. Never
  // hangs or errors (rule 4): every signal assembleFeasibilityScore composes
  // already degrades to neutral on its own.
  fastify.post<{ Body: ScoreRequestBody }>('/score', async (request, reply) => {
    const { businessId, districtId, blockId, locale } = request.body ?? {}
    if (!businessId || !districtId || !blockId) {
      return reply.status(400).send({ error: { message: 'businessId, districtId, and blockId are required', code: 'BAD_REQUEST' } })
    }

    const resolvedDistrictId = await getCachedDistrictId(fastify.redis, fastify.db, districtId)
    const resolvedBlockId = resolvedDistrictId ? await getCachedBlockId(fastify.redis, fastify.db, resolvedDistrictId, blockId) : null

    const result = await assembleFeasibilityScore(
      {
        db: fastify.db,
        redis: fastify.redis,
        agmarknetProvider,
        narrate: (input) => narrateReport({ db: fastify.db, redis: fastify.redis }, input),
      },
      { businessId, districtName: districtId, blockId: resolvedBlockId, locale }
    )

    return reply.status(200).send(result)
  })

  // Unauthenticated — informational, not one of the "saving/appealing/
  // notifications" actions auth gates. Never throws (see service.ts).
  fastify.get<{ Querystring: { district?: string } }>('/local-demand', async (request, reply) => {
    const district = request.query.district
    if (!district) {
      return reply.status(400).send({ error: { message: 'district is required', code: 'BAD_REQUEST' } })
    }
    const signal = await getLocalDemandSignal(fastify.redis, agmarknetProvider, district)
    return reply.header('Cache-Control', `public, max-age=${LOCAL_DEMAND_MAX_AGE}`).status(200).send(signal)
  })

  fastify.get<{ Querystring: { districtId?: string } }>('/informal-lending-rate', async (request, reply) => {
    const result = await getInformalLendingRate(fastify.db, request.query.districtId ?? null)
    return reply.header('Cache-Control', `public, max-age=${INFORMAL_RATE_MAX_AGE}`).status(200).send(result)
  })

  // Bridges the client's mock district slug to a real district UUID (see
  // service.ts) so /informal-lending-rate's district tier is reachable at
  // all. Unauthenticated — informational, same as the other two GETs.
  fastify.get<{ Querystring: { name?: string } }>('/district-id', async (request, reply) => {
    const name = request.query.name
    if (!name) {
      return reply.status(400).send({ error: { message: 'name is required', code: 'BAD_REQUEST' } })
    }
    const id = await getCachedDistrictId(fastify.redis, fastify.db, name)
    return reply.header('Cache-Control', `public, max-age=${DISTRICT_REFERENCE_MAX_AGE}`).status(200).send({ id })
  })

  // Anonymized aggregate only — see peerBenchmark.ts's K_ANONYMITY_THRESHOLD
  // comment for why 5. Public/unauthenticated: the response never carries
  // anything identifying, by construction (it's a cohort-level aggregate or
  // nothing at all).
  fastify.get<{ Querystring: { businessId?: string; districtId?: string; verdictKey?: string } }>(
    '/peer-benchmark',
    async (request, reply) => {
      const { businessId, districtId, verdictKey } = request.query
      if (!businessId || !districtId || !verdictKey) {
        return reply
          .status(400)
          .send({ error: { message: 'businessId, districtId, and verdictKey are required', code: 'BAD_REQUEST' } })
      }
      const result = await getPeerBenchmark(fastify.db, { businessId, districtId, verdictKey })
      return reply.header('Cache-Control', `public, max-age=${PEER_BENCHMARK_MAX_AGE}`).status(200).send(result)
    }
  )

  // Reuses the exact same tested DIGIPIN algorithm the ingestion pipeline
  // already relies on (apps/api/src/ingestion/digipin/algorithm.ts) —
  // never forked, per CLAUDE.md rule 1's spirit (this isn't a rupee figure,
  // but the same "one source of truth" logic applies). Unauthenticated:
  // pure coordinate math, not personal data by itself, same class as the
  // other public GETs here. The site-capture module (modules/siteCapture)
  // is what actually persists a DIGIPIN alongside consent + a photo.
  fastify.get<{ Querystring: { lat?: string; lon?: string } }>('/digipin', async (request, reply) => {
    const lat = Number(request.query.lat)
    const lon = Number(request.query.lon)
    if (!request.query.lat || !request.query.lon || Number.isNaN(lat) || Number.isNaN(lon)) {
      return reply.status(400).send({ error: { message: 'lat and lon are required numbers', code: 'BAD_REQUEST' } })
    }
    try {
      const digipin = encodeDigipin(lat, lon)
      return reply.status(200).send({ digipin })
    } catch (err) {
      if (err instanceof DigipinOutOfBoundsError) {
        return reply.status(400).send({ error: { message: err.message, code: 'OUT_OF_BOUNDS' } })
      }
      throw err
    }
  })

  // Best-effort GPS -> state/district name resolution for the Wizard's
  // "use my current location" button — the client matches the returned
  // names against its own mock catalogue (CLAUDE.md rule 4: never blocks
  // or errors, just resolves to nulls when the provider can't answer).
  // Unauthenticated: same class as /digipin, a coordinate lookup with
  // nothing identifying beyond the point itself.
  fastify.get<{ Querystring: { lat?: string; lon?: string } }>('/reverse-geocode', async (request, reply) => {
    const lat = Number(request.query.lat)
    const lon = Number(request.query.lon)
    if (!request.query.lat || !request.query.lon || Number.isNaN(lat) || Number.isNaN(lon)) {
      return reply.status(400).send({ error: { message: 'lat and lon are required numbers', code: 'BAD_REQUEST' } })
    }
    try {
      const result = await geocodingProvider.reverseGeocode(lat, lon)
      return reply.status(200).send(result ?? { state: null, district: null })
    } catch {
      return reply.status(200).send({ state: null, district: null })
    }
  })
}

export default feasibilityRoutes
