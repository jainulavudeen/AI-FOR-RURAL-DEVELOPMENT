// Live Google Maps enhancement calls (apps/api modules/googleMaps). Every
// function here:
//   - is skipped entirely when the device is offline — no request, no
//     empty slot; callers render government data only;
//   - has a short client-side timeout, so a slow link never holds a
//     spinner (CLAUDE.md rule 4);
//   - returns null on any failure, never throws;
//   - never writes to localStorage/IndexedDB. Google's terms don't allow
//     caching its content client-side, and vite.config.js keeps
//     /google-maps out of the service worker cache for the same reason.

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
// Covers the worst-case chain: Google timeout (3 s) then OSM search + routing.
const CLIENT_TIMEOUT_MS = 12000
const SESSION_KEY = 'setu:gmaps-session'

export function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// A random per-tab id the server's per-session call cap is counted
// against. sessionStorage (not localStorage): it's a session, and it holds
// no Google data.
function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}

async function getJson(path, params) {
  if (!isOnline()) return null
  const sid = sessionId()
  const query = new URLSearchParams({ ...params, ...(sid ? { sid } : {}) })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_BASE}${path}?${query}`, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// { competition, nearestFacilities } — either half may be null.
export async function getReportEnhancement(lat, lon, businessId) {
  if (lat == null || lon == null || !businessId) return null
  const data = await getJson('/google-maps/report-enhancement', { lat: String(lat), lon: String(lon), businessId })
  if (!data || (!data.competition && !data.nearestFacilities)) return null
  return data
}

// A suggestion for the user to confirm or correct — never stored as-is.
export async function getSiteAddressSuggestion(lat, lon) {
  if (lat == null || lon == null) return null
  const data = await getJson('/google-maps/site-address', { lat: String(lat), lon: String(lon) })
  return data?.suggestion ?? null
}
