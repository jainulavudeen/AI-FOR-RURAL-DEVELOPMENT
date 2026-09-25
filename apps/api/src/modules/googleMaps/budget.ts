import type { RedisLike } from '../../lib/redis/types.js'
import { checkAndIncrement } from '../../lib/rateLimit.js'

// The SKU each call is billed under, with Google's first-volume-tier list
// price (USD per 1,000 billable events), as published on
// developers.google.com/maps/billing-and-pricing/pricing when this was
// written (2026-09). These are NOT what we pay — reserveFreeTier below
// keeps every call inside the monthly free allowance, so actual spend is
// $0. The list price is logged only so the usage report can say what the
// same traffic would cost a paid national deployment.
export type GoogleSku =
  | 'places_nearby_search_pro'
  | 'places_text_search_essentials_ids_only'
  | 'places_details_essentials'
  | 'routes_compute_route_matrix_essentials'
  | 'geocoding_reverse'

export const SKU_USD_PER_1000: Record<GoogleSku, number> = {
  // Nearby Search has no IDs-only tier; places.id/location/types bill as Pro.
  places_nearby_search_pro: 32,
  // Free: a field mask of only places.id keeps Text Search on this SKU.
  places_text_search_essentials_ids_only: 0,
  // Re-fetching a cached place_id's location after its 30-day coordinate
  // expiry — much cheaper than repeating the Nearby Search.
  places_details_essentials: 5,
  // Billed per element (origin x destination), not per request.
  routes_compute_route_matrix_essentials: 5,
  geocoding_reverse: 5,
}

// FREE TIER ONLY. Google's monthly free usage per SKU (billing-and-pricing,
// 2026-09): Essentials 10,000 / Pro 5,000 billable events a month, and
// Text Search IDs Only unlimited. We never go past a safety fraction of
// these — once a SKU's monthly allowance is spent, calls to it stop and the
// service falls back to OpenStreetMap (fallbackProvider.ts), then to
// government data only. There is no configuration that lifts this.
// `null` = no cap needed (free without limit).
export const FREE_MONTHLY_UNITS: Record<GoogleSku, number | null> = {
  places_nearby_search_pro: 5000,
  places_text_search_essentials_ids_only: null,
  places_details_essentials: 10000,
  routes_compute_route_matrix_essentials: 10000,
  geocoding_reverse: 10000,
}

export interface BudgetConfig {
  sessionCap: number
  dailyCap: number
  // 1..100 — how much of each free allowance we let ourselves use. Below
  // 100 leaves headroom for counter drift (e.g. a request Google billed
  // that timed out on our side).
  freeTierSafetyPercent: number
}

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; reason: 'session_cap' | 'daily_cap' | 'free_tier_exhausted' | 'budget_unavailable' }

const SESSION_WINDOW_SECONDS = 12 * 60 * 60
const DAY_WINDOW_SECONDS = 26 * 60 * 60 // covers the whole UTC day plus clock skew
const USAGE_RETENTION_SECONDS = 90 * 24 * 60 * 60

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

// Google's billing month runs on US Pacific time, so the free allowance
// resets at Pacific midnight on the 1st, not UTC.
export function billingMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).format(now)
}

export function freeTierCap(sku: GoogleSku, safetyPercent: number): number | null {
  const free = FREE_MONTHLY_UNITS[sku]
  if (free === null) return null
  const pct = Math.min(Math.max(safetyPercent, 1), 100)
  return Math.floor((free * pct) / 100)
}

const FREE_TIER_KEY_TTL_SECONDS = 40 * 24 * 60 * 60

// Reserve `units` of a SKU's monthly free allowance BEFORE the call. Only
// real Google calls are counted (mock calls cost nothing). Over-counting is
// possible (a reserved call that then fails) and deliberate: the error is
// always on the side of spending less, never more. Fails closed.
export async function reserveFreeTier(
  redis: RedisLike,
  sku: GoogleSku,
  units: number,
  safetyPercent: number,
  now = new Date()
): Promise<boolean> {
  const cap = freeTierCap(sku, safetyPercent)
  if (cap === null) return true
  try {
    const key = `gmaps:free:${billingMonth(now)}:${sku}`
    const used = await redis.incrby(key, units)
    if (used === units) await redis.expire(key, FREE_TIER_KEY_TTL_SECONDS)
    return used <= cap
  } catch {
    return false
  }
}

// Read-only: would `units` more of this SKU still fit in the free
// allowance? Lets a caller pick the fallback up front instead of starting
// a lookup Google can't finish for free. Fails closed.
export async function hasFreeTierHeadroom(redis: RedisLike, sku: GoogleSku, units: number, safetyPercent: number, now = new Date()): Promise<boolean> {
  const cap = freeTierCap(sku, safetyPercent)
  if (cap === null) return true
  try {
    const raw = await redis.get(`gmaps:free:${billingMonth(now)}:${sku}`)
    return (raw ? Number(raw) : 0) + units <= cap
  } catch {
    return false
  }
}

export async function readFreeTierUsage(
  redis: RedisLike,
  safetyPercent: number,
  now = new Date()
): Promise<{ month: string; skus: Record<GoogleSku, { used: number; cap: number | null; freeAllowance: number | null }> }> {
  const month = billingMonth(now)
  const skus = {} as Record<GoogleSku, { used: number; cap: number | null; freeAllowance: number | null }>
  for (const sku of Object.keys(FREE_MONTHLY_UNITS) as GoogleSku[]) {
    const raw = await redis.get(`gmaps:free:${month}:${sku}`)
    skus[sku] = { used: raw ? Number(raw) : 0, cap: freeTierCap(sku, safetyPercent), freeAllowance: FREE_MONTHLY_UNITS[sku] }
  }
  return { month, skus }
}

// Reserve one billable call against both caps before it is made. Fails
// CLOSED: if Redis can't answer, we don't know the spend, so no call goes
// out — the report just shows government data only (rule 4).
export async function reserveCall(redis: RedisLike, sessionId: string, config: BudgetConfig, now = new Date()): Promise<BudgetDecision> {
  try {
    const daily = await checkAndIncrement(redis, `gmaps:cap:day:${utcDay(now)}`, config.dailyCap, DAY_WINDOW_SECONDS)
    if (!daily.allowed) return { allowed: false, reason: 'daily_cap' }
    const session = await checkAndIncrement(redis, `gmaps:cap:session:${sessionId}`, config.sessionCap, SESSION_WINDOW_SECONDS)
    if (!session.allowed) return { allowed: false, reason: 'session_cap' }
    return { allowed: true }
  } catch {
    return { allowed: false, reason: 'budget_unavailable' }
  }
}

export interface CallLogEntry {
  sku: GoogleSku
  billableUnits: number
  provider: 'mock' | 'real'
  outcome: 'ok' | 'error' | 'timeout'
}

export interface CallLogger {
  info: (obj: object, msg: string) => void
}

// Every Google call, real or mock, is logged with its cost category and
// counted per UTC day per SKU in Redis (90-day retention), so the usage
// report can project national cost from real call patterns. Mock calls are
// counted separately so demo traffic never inflates the real-spend figure.
export async function recordCall(redis: RedisLike, logger: CallLogger, entry: CallLogEntry, now = new Date()): Promise<void> {
  const estimatedUsd = (SKU_USD_PER_1000[entry.sku] / 1000) * entry.billableUnits
  logger.info({ event: 'google_maps_call', costCategory: entry.sku, estimatedUsd, ...entry }, 'google maps call')
  try {
    const key = `gmaps:usage:${utcDay(now)}:${entry.provider}:${entry.sku}`
    const count = await redis.incrby(key, entry.billableUnits)
    if (count === entry.billableUnits) await redis.expire(key, USAGE_RETENTION_SECONDS)
  } catch {
    // The structured log line above is the durable record; a Redis
    // failure here must never fail the call it's accounting for.
  }
}

export interface UsageDay {
  day: string
  provider: 'mock' | 'real'
  bySku: Partial<Record<GoogleSku, { units: number; estimatedUsd: number }>>
  estimatedUsd: number
}

export async function readUsage(redis: RedisLike, days: number, now = new Date()): Promise<UsageDay[]> {
  const out: UsageDay[] = []
  for (let offset = 0; offset < days; offset++) {
    const day = utcDay(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000))
    for (const provider of ['real', 'mock'] as const) {
      const bySku: UsageDay['bySku'] = {}
      let total = 0
      for (const sku of Object.keys(SKU_USD_PER_1000) as GoogleSku[]) {
        const raw = await redis.get(`gmaps:usage:${day}:${provider}:${sku}`)
        const units = raw ? Number(raw) : 0
        if (units === 0) continue
        const estimatedUsd = (SKU_USD_PER_1000[sku] / 1000) * units
        bySku[sku] = { units, estimatedUsd }
        total += estimatedUsd
      }
      if (Object.keys(bySku).length > 0) out.push({ day, provider, bySku, estimatedUsd: total })
    }
  }
  return out
}
