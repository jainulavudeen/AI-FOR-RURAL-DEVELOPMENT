// "Flag this data", "Request human review", and the Partner Dashboard's
// officer-queue calls. Uses authorizedFetch (lib/auth.js) — every route
// here is gated server-side behind fastify.authenticate.

import { authorizedFetch } from './auth'

// flagInsight/requestReview are coupled to apps/web/vite.config.js's
// runtimeCaching entry for these exact two paths (POST /feedback/flag,
// /feedback/appeal): a thrown fetch here is only safe to report as
// "queued" because that service-worker entry genuinely queues it for
// background sync. If either changes, check the other.
async function postQueueable(path, body) {
  try {
    const response = await authorizedFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data, queued: false }
  } catch {
    return { ok: true, status: 0, data: {}, queued: true }
  }
}

export async function flagInsight({ sourceTable, sourceRowId, reason }) {
  return postQueueable('/feedback/flag', { sourceTable, sourceRowId, reason })
}

export async function requestReview({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource }) {
  return postQueueable('/feedback/appeal', { inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource })
}

// Officer actions are NOT background-synced (officers are assumed to have
// more reliable connectivity) — a network failure here is a real,
// retryable error, not a queued success.
export async function getOfficerQueue() {
  try {
    const response = await authorizedFetch('/feedback/queue')
    const data = await response.json().catch(() => ([]))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: [] }
  }
}

export async function updateAppeal(id, { status, resolutionNote }) {
  try {
    const response = await authorizedFetch(`/feedback/appeals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolutionNote }),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}
