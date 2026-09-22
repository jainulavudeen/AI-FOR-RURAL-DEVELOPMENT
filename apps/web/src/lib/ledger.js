// Bahi-Khata's network layer. recordTransaction is coupled to
// apps/web/vite.config.js's runtimeCaching entry for POST
// /ledger/transactions: a thrown fetch there is only safe to report as
// "queued" because that service-worker entry genuinely queues it for
// background sync (same shape as lib/feedback.js's postQueueable — see
// that file's own note on the same coupling). If either changes, check
// the other.

import { authorizedFetch } from './auth'

export async function recordTransaction({ type, amount, paymentMode, customerName, note, occurredAt }) {
  try {
    const response = await authorizedFetch('/ledger/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, paymentMode, customerName, note, occurredAt }),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data, queued: false }
  } catch {
    return { ok: true, status: 0, data: {}, queued: true }
  }
}

// Both reads degrade the same way: a thrown fetch (offline, no cache hit
// yet) resolves to an empty result rather than propagating — the calling
// screen renders its own empty/zero state instead of hanging or erroring
// (CLAUDE.md boundary rule 4). A cache hit (Workbox's StaleWhileRevalidate
// entry for these two paths) still resolves normally through fetch() and
// never reaches the catch block.
export async function getTransactions() {
  try {
    const response = await authorizedFetch('/ledger/transactions')
    const data = await response.json().catch(() => [])
    return { ok: response.ok, data: Array.isArray(data) ? data : [] }
  } catch {
    return { ok: false, data: [] }
  }
}

export async function getLedgerSummary() {
  try {
    const response = await authorizedFetch('/ledger/summary')
    const data = await response.json().catch(() => null)
    return { ok: response.ok, data }
  } catch {
    return { ok: false, data: null }
  }
}
