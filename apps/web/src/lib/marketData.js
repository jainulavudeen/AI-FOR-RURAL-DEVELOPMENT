// Plain, unauthenticated fetches — public informational data, not a
// gated action (see CLAUDE.md: auth only gates saving, appealing,
// notifications). Never blocks a report: every function here degrades to
// a clearly-labelled fallback instead of throwing.

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

// Same honest regional-estimate figure as the backend's seeded fallback
// row (apps/api/src/db/seed.ts) — kept here too so the card still renders
// if the API is unreachable, per CLAUDE.md rule 4.
export const FALLBACK_INFORMAL_RATE = {
  ratePercent: 36,
  label: 'regional_estimate',
  vintageLabel: 'Illustrative regional estimate',
}

// apps/web/src/data/locations.js's district ids ('madurai', 'kanpur', ...)
// are client-side mock slugs, not the real Postgres district UUIDs the
// backend's district-specific lookups expect. Resolved once per district
// via GET /feasibility/district-id and cached in module scope — only the
// seeded Madurai pilot district will ever resolve; everything else
// legitimately returns null and callers fall through to their honest
// fallback, not an error.
const districtIdCache = new Map()

async function resolveDistrictId(districtSlug) {
  if (!districtSlug) return null
  if (districtIdCache.has(districtSlug)) return districtIdCache.get(districtSlug)

  const promise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/feasibility/district-id?name=${encodeURIComponent(districtSlug)}`)
      if (!response.ok) return null
      const data = await response.json()
      return data.id ?? null
    } catch {
      return null
    }
  })()

  districtIdCache.set(districtSlug, promise)
  return promise
}

// Two-tier lookup: pass the resolved real district UUID when we have one
// (today, only Madurai), otherwise every other district correctly falls
// through to the single honestly-labelled regional estimate row.
export async function getInformalLendingRate(districtSlug) {
  try {
    const districtId = await resolveDistrictId(districtSlug)
    const query = districtId ? `?districtId=${encodeURIComponent(districtId)}` : ''
    const response = await fetch(`${API_BASE}/feasibility/informal-lending-rate${query}`)
    if (!response.ok) return FALLBACK_INFORMAL_RATE
    return await response.json()
  } catch {
    return FALLBACK_INFORMAL_RATE
  }
}

// A standalone client-side call to GET /feasibility/local-demand used to
// live here, overlaying just the demand factor onto the seeded mock
// score. Removed with the mock itself (CLAUDE.md item 4: real scoring
// replaces it wholesale via getFeasibilityScore below, which already
// composes the same Agmarknet-backed demand signal server-side through
// assembleFeasibilityScore) — a second, separate client fetch of the same
// signal was redundant once the composite endpoint existed. The backend
// route itself is untouched and still real, tested, independently
// reachable infrastructure; only this now-dead client wrapper is gone.

// Real, data-backed factor assembly (Census infra + NRLM SHG density,
// narrated via the grounding service) — see apps/api's
// feasibility/service.ts assembleFeasibilityScore. Degrades to `null` on
// any failure, same as every other function here: lib/feasibility.js's
// applyRealFactors treats `null` as "nothing to overlay", leaving the
// seeded baseline standing (CLAUDE.md rule 4 — offline-first, never a
// blocking or erroring second pass).
// A POST body isn't a cache-key-safe GET, so this can't sit in the
// service worker's Workbox runtimeCaching (see vite.config.js) the way the
// three GET signals above do. Instead, the last successful response for a
// given (business, district, block, language) is kept in localStorage and
// read back on failure — the same "degrade, don't error" shape as every
// other function here, just persisted across reloads so a report already
// viewed once stays available offline, per CLAUDE.md rule 4.
const scoreStorageKey = (businessId, stateSlug, districtSlug, blockId, locale) =>
  `setu:feasibility-score:${businessId}|${stateSlug}|${districtSlug}|${blockId}|${locale}`

function readCachedScore(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCachedScore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full/unavailable (private browsing, quota) — the live value
    // still renders this session, it just won't survive a reload offline.
  }
}

export async function getFeasibilityScore(businessId, stateSlug, districtSlug, blockId, locale) {
  if (!businessId || !districtSlug || !blockId) return null
  const key = scoreStorageKey(businessId, stateSlug, districtSlug, blockId, locale)
  try {
    const response = await fetch(`${API_BASE}/feasibility/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId, stateId: stateSlug, districtId: districtSlug, blockId, locale }),
    })
    if (!response.ok) return readCachedScore(key)
    const data = await response.json()
    writeCachedScore(key, data)
    return data
  } catch {
    return readCachedScore(key)
  }
}

// Anonymised peer-benchmark aggregate — see apps/api's peerBenchmark.ts for
// the k-anonymity gate. `available: false` (never an error, never a partial
// count below the threshold) is the correct and expected response for most
// (business, district, verdict) combinations in this small pilot dataset —
// the UI treats it as "nothing to show yet," not a failure.
export const FALLBACK_PEER_BENCHMARK = { available: false }

// GPS -> state/district name lookup backing LocationDigipin.jsx's "use my
// current location" button. Returns null on any failure/no-match — the
// caller (LocationDigipin) treats null exactly like a match that didn't
// resolve against the mock catalogue: DIGIPIN pinning already succeeded
// independently, so this never blocks or errors that, per CLAUDE.md rule 4.
export async function getReverseGeocode(lat, lon) {
  if (lat == null || lon == null) return null
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
    const response = await fetch(`${API_BASE}/feasibility/reverse-geocode?${params}`)
    if (!response.ok) return null
    const data = await response.json()
    if (!data?.state) return null
    return data
  } catch {
    return null
  }
}

// Census 2011 facility figures for the Census village nearest a pin — our
// own government data, so (unlike lib/googleMaps.js) the service worker
// may cache it and it still renders offline once seen. null = no Census
// village near this pin, or unreachable.
export async function getCensusFacilities(lat, lon) {
  if (lat == null || lon == null) return null
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
    const response = await fetch(`${API_BASE}/feasibility/census-facilities?${params}`)
    if (!response.ok) return null
    const data = await response.json()
    return data?.census ?? null
  } catch {
    return null
  }
}

export async function getPeerBenchmark(businessId, districtSlug, verdictKey) {
  if (!businessId || !districtSlug || !verdictKey) return FALLBACK_PEER_BENCHMARK
  try {
    const params = new URLSearchParams({ businessId, districtId: districtSlug, verdictKey })
    const response = await fetch(`${API_BASE}/feasibility/peer-benchmark?${params}`)
    if (!response.ok) return FALLBACK_PEER_BENCHMARK
    return await response.json()
  } catch {
    return FALLBACK_PEER_BENCHMARK
  }
}
