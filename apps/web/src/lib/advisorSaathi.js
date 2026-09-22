// POST /advisor-saathi/chat. Deliberately NOT queued for offline
// background-sync the way lib/ledger.js's recordTransaction is — a chat
// question replayed minutes (or hours) later against context that's gone
// stale by then would be actively misleading, unlike a queued sale, which
// is just as true whenever it's finally recorded. A thrown fetch here
// resolves to `ok: false` so the caller can show an honest "unavailable,
// try again once online" message — never a client-fabricated answer,
// which would itself violate CLAUDE.md's "LLM narrates, never computes"
// boundary by proxy.
import { authorizedFetch } from './auth'

export async function askAdvisorSaathi({ question, selection, locale }) {
  try {
    const response = await authorizedFetch('/advisor-saathi/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, selection, locale }),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, data }
  } catch {
    return { ok: false, data: null }
  }
}
