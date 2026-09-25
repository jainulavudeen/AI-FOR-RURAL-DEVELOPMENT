// The applicant → officer → Verified Approval flow (apps/api's
// modules/applications). Every route is role-checked server-side; these
// helpers only shape the calls. Not background-synced: submitting,
// deciding and reassigning are actions the user waits to see confirmed,
// so a network failure reads as "try again", never as a fake success.
import { authorizedFetch } from './auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

async function call(path, { method = 'GET', body } = {}) {
  try {
    const response = await authorizedFetch(path, {
      method,
      ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

// Applicant
export const createApplication = (reportId) => call('/applications', { method: 'POST', body: { reportId } })
export const listMyApplications = () => call('/applications/mine')
export const submitApplication = (id, body = {}) => call(`/applications/${id}/submit`, { method: 'POST', body })
export const reviseApplication = (id, reportId) => call(`/applications/${id}/revise`, { method: 'POST', body: { reportId } })

// Officer
export const listAssignedApplications = () => call('/applications/assigned')
export const startReview = (id) => call(`/applications/${id}/start-review`, { method: 'POST' })
export const decideApplication = (id, decision, note) => call(`/applications/${id}/decision`, { method: 'POST', body: { decision, note } })

// Admin
export const listAllApplications = ({ status, unassigned } = {}) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (unassigned) params.set('unassigned', 'true')
  const qs = params.toString()
  return call(`/applications${qs ? `?${qs}` : ''}`)
}
export const reassignApplication = (id, officerId, note) => call(`/applications/${id}/reassign`, { method: 'POST', body: { officerId, note } })

// Any role that may see it
export const getApplication = (id) => call(`/applications/${id}`)

// Public — a bank checking a printed Verified Approval. No session needed,
// so a plain fetch (no Authorization header at all).
export async function verifyApproval(hash) {
  try {
    const response = await fetch(`${API_BASE}/applications/verify/${encodeURIComponent(hash)}`)
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export const STATUS_STYLES = {
  draft: 'bg-ink-900/5 text-ink-900/70',
  submitted: 'bg-primary-100 text-primary-700',
  under_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-teal-600/10 text-teal-700',
  rejected: 'bg-red-100 text-red-700',
  more_info: 'bg-orange-100 text-orange-700',
}
