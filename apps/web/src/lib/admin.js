// Admin Portal's oversight endpoints — every route here is gated
// server-side to role==='admin' (apps/api's modules/admin/service.ts
// asserts this on every function, not just via fastify.authenticate); an
// officer or applicant token reaches the exact same 403 an unauthenticated
// caller would. This file adds no client-side gate of its own beyond what
// AdminPortal.jsx does for UX — the real enforcement is server-side.
import { authorizedFetch } from './auth'

async function getJson(path) {
  try {
    const response = await authorizedFetch(path)
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function getOfficerStats() {
  return getJson('/admin/officers')
}

export async function getAdminReports({ districtId, verdictKey } = {}) {
  const params = new URLSearchParams()
  if (districtId) params.set('districtId', districtId)
  if (verdictKey) params.set('verdictKey', verdictKey)
  const qs = params.toString()
  return getJson(`/admin/reports${qs ? `?${qs}` : ''}`)
}

export async function getAdminAppeals({ districtId, officerId, status } = {}) {
  const params = new URLSearchParams()
  if (districtId) params.set('districtId', districtId)
  if (officerId) params.set('officerId', officerId)
  if (status) params.set('status', status)
  const qs = params.toString()
  return getJson(`/admin/appeals${qs ? `?${qs}` : ''}`)
}

export async function reassignAppeal(appealId, officerId) {
  try {
    const response = await authorizedFetch(`/admin/appeals/${appealId}/reassign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerId }),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function getAuditLog({ targetType, actorId, targetId } = {}) {
  const params = new URLSearchParams()
  if (targetType) params.set('targetType', targetType)
  if (actorId) params.set('actorId', actorId)
  if (targetId) params.set('targetId', targetId)
  const qs = params.toString()
  return getJson(`/admin/audit-log${qs ? `?${qs}` : ''}`)
}

async function send(path, method, body) {
  try {
    const response = await authorizedFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

// Officer accounts — the only way anyone becomes an officer. Invite by
// phone (signs in with OTP) and/or Gmail (claimed on first Google
// sign-in); name + designation are what gets frozen onto their approvals.
export async function getOfficerAccounts() {
  return getJson('/admin/officer-accounts')
}

export async function inviteOfficer({ phone, email, displayName, designation }) {
  return send('/admin/officer-accounts', 'POST', { phone, email, displayName, designation })
}

export async function updateOfficer(id, patch) {
  return send(`/admin/officer-accounts/${id}`, 'PATCH', patch)
}

// Replaces the officer's whole set: [{ districtId, blockId|null }] —
// blockId null = the whole district.
export async function setOfficerJurisdictions(id, jurisdictions) {
  return send(`/admin/officer-accounts/${id}/jurisdictions`, 'PUT', { jurisdictions })
}
