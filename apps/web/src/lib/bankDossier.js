// POST /bank-dossier/generate and GET /bank-dossier/:id. Generation needs
// connectivity (it assembles a fresh snapshot); a previously generated
// dossier's GET is Workbox StaleWhileRevalidate-cached (vite.config.js),
// so reprinting an existing dossier keeps working offline even though
// making a new one does not.

import { authorizedFetch } from './auth'

export async function generateBankDossier({ selection, schemeId, proprietorName, bankName }) {
  try {
    const response = await authorizedFetch('/bank-dossier/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection, schemeId, proprietorName, bankName }),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export async function getBankDossier(id) {
  try {
    const response = await authorizedFetch(`/bank-dossier/${id}`)
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

// Officer-only (enforced server-side) — records a "Verified Approval", not
// a digital signature (this app has no government DSC — see CLAUDE.md
// item 7). Every call inserts a fresh approval row server-side; re-calling
// this after an edit/re-review adds another approval rather than editing
// the first, so a previously-printed hash keeps verifying against exactly
// the record it was issued from.
export async function approveBankDossier(id, { officerName, officerDesignation }) {
  try {
    const response = await authorizedFetch(`/bank-dossier/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ officerName, officerDesignation }),
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

// Public, unauthenticated — a bank verifying a hash printed on paper has
// no Setu login of their own. authorizedFetch degrades to a plain fetch
// when there's no session, which is exactly what's needed here.
export async function verifyBankDossierApproval(hash) {
  try {
    const response = await authorizedFetch(`/bank-dossier/verify/${encodeURIComponent(hash)}`)
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}
