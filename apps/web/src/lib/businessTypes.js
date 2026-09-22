// GET /business-types — the DB-backed, versioned catalogue (see apps/api's
// businessTypes module). Unauthenticated, same class as feasibility's
// informational GETs. data/businesses.js stays the static default the
// Wizard renders instantly from with zero network dependency; this is
// only ever a non-blocking enrichment pass on top of it (same shape as
// lib/feasibility.js's applyDemandSignal) — a genuinely offline device
// never sees anything different because of this file.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export async function getBusinessTypes() {
  try {
    const response = await fetch(`${API_BASE}/business-types`)
    const data = await response.json().catch(() => [])
    return { ok: response.ok, data: Array.isArray(data) ? data : [] }
  } catch {
    return { ok: false, data: [] }
  }
}
