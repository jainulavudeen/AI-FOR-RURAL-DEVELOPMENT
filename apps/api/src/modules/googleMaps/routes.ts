import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { env } from '../../config/env.js'
import { FREE_MONTHLY_UNITS, readFreeTierUsage, readUsage, SKU_USD_PER_1000 } from './budget.js'
import { createFallbackProvider } from './fallbackProvider.js'
import { createGoogleMapsProvider } from './provider.js'
import { getCompetitionDensity, getNearestFacilities, suggestSiteAddress, type GoogleMapsDeps } from './service.js'
import type { ReportEnhancement } from './types.js'

// Sessions are identified by a random id the client keeps in
// sessionStorage (lib/googleMaps.js), sent as `?sid=` rather than a custom
// header so these stay CORS "simple" GETs — no extra preflight round trip
// on a 2G link. It's client-supplied, so the per-session cap is a courtesy
// limit; the daily cap is the real spend ceiling.
function sessionIdFor(request: FastifyRequest<{ Querystring: { sid?: string } }>): string {
  const value = request.query.sid
  if (value && /^[A-Za-z0-9-]{8,64}$/.test(value)) return value
  return `ip:${request.ip}`
}

function parsePoint(query: { lat?: string; lon?: string }): { lat: number; lon: number } | null {
  const lat = Number(query.lat)
  const lon = Number(query.lon)
  if (!query.lat || !query.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

// Unauthenticated like feasibility's informational GETs — but every
// response is `no-store`: Google content must not land in a browser or
// service-worker cache (see apps/web/vite.config.js, which deliberately
// has no runtimeCaching entry for /google-maps).
const googleMapsRoutes: FastifyPluginAsync = async (fastify) => {
  const provider = createGoogleMapsProvider()
  const fallback = createFallbackProvider()
  const budget = {
    sessionCap: env.GOOGLE_MAPS_SESSION_CALL_CAP,
    dailyCap: env.GOOGLE_MAPS_DAILY_CALL_CAP,
    freeTierSafetyPercent: env.GOOGLE_MAPS_FREE_TIER_SAFETY_PERCENT,
  }
  const deps = (): GoogleMapsDeps => ({
    redis: fastify.redis,
    provider,
    fallback,
    logger: fastify.log,
    budget,
    timeoutMs: env.GOOGLE_MAPS_TIMEOUT_MS,
    fallbackTimeoutMs: env.MAP_FALLBACK_TIMEOUT_MS,
  })

  // One call per report view: competition density + nearest facilities, in
  // parallel. Each half independently degrades to null; this route never
  // errors past input validation.
  fastify.get<{ Querystring: { lat?: string; lon?: string; businessId?: string; sid?: string } }>('/report-enhancement', async (request, reply) => {
    const point = parsePoint(request.query)
    if (!point || !request.query.businessId) {
      return reply.status(400).send({ error: { message: 'lat, lon and businessId are required', code: 'BAD_REQUEST' } })
    }
    const sessionId = sessionIdFor(request)
    const [competition, nearestFacilities] = await Promise.all([
      getCompetitionDensity(deps(), { point, businessId: request.query.businessId, sessionId }).catch(() => null),
      getNearestFacilities(deps(), { point, sessionId }).catch(() => null),
    ])
    const body: ReportEnhancement = { competition, nearestFacilities }
    return reply.header('Cache-Control', 'no-store').status(200).send(body)
  })

  fastify.get<{ Querystring: { lat?: string; lon?: string; sid?: string } }>('/site-address', async (request, reply) => {
    const point = parsePoint(request.query)
    if (!point) {
      return reply.status(400).send({ error: { message: 'lat and lon are required numbers', code: 'BAD_REQUEST' } })
    }
    const suggestion = await suggestSiteAddress(deps(), { point, sessionId: sessionIdFor(request) }).catch(() => null)
    return reply.header('Cache-Control', 'no-store').status(200).send({ suggestion })
  })

  // Usage report for the admin: this billing month's free-tier usage per
  // SKU against its cap (actual spend is $0 by construction), plus daily
  // call counts with the list price the same traffic would cost if paid —
  // the basis for projecting a national deployment.
  fastify.get<{ Querystring: { days?: string } }>('/usage', { preHandler: [fastify.requireRole('admin')] }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: { message: 'Forbidden', code: 'FORBIDDEN' } })
    }
    const days = Math.min(Math.max(Number(request.query.days) || 7, 1), 90)
    const usage = await readUsage(fastify.redis, days)
    return reply.status(200).send({
      provider: provider.kind,
      fallback: fallback?.kind ?? 'none',
      caps: budget,
      freeTier: await readFreeTierUsage(fastify.redis, budget.freeTierSafetyPercent),
      freeMonthlyUnits: FREE_MONTHLY_UNITS,
      listPriceUsdPer1000IfPaid: SKU_USD_PER_1000,
      usage,
    })
  })
}

export default googleMapsRoutes
