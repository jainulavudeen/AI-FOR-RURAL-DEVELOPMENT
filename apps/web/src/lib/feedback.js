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

// Best-effort persistence of every completed report (not just appealed
// ones) — feeds the peer-benchmark cohort (see lib/marketData.js's
// getPeerBenchmark). Deliberately NOT queued for background sync like
// flagInsight/requestReview above: this is a silent side-effect of viewing
// a report, not a user-initiated action the user is waiting to see
// confirmed, so a dropped call while offline is fine to just drop — no
// "queued" state to show, and per CLAUDE.md rule 4, never blocks or errors
// visibly either way. Only ever called when the applicant is authenticated
// (see Results.jsx) — the same auth boundary as every other "saving" call.
export async function saveReport({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource }) {
  try {
    const response = await authorizedFetch('/feedback/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource }),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, data: data?.id ?? null }
  } catch {
    return { ok: false, data: null }
  }
}

// Applicant-initiated CPGRAMS escalation (see apps/api's
// modules/feedback/escalation.ts) — a real, retryable action the applicant
// is actively waiting to see confirmed, not a silent background save, so
// NOT queued like requestReview above: a network failure here should read
// as "try again," not "queued."
export async function escalateAppeal(appealId) {
  try {
    const response = await authorizedFetch(`/feedback/appeals/${appealId}/escalate`, { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
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
