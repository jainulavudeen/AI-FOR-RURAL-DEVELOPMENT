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

// Approval no longer happens here: an officer approves an APPLICATION
// assigned to them (lib/applications.js), which attaches the Verified
// Approval to that application's frozen dossier. GET /bank-dossier/:id
// returns it as `approval` + `verifyUrl` + `qrSvg` (server-rendered).
// Public verification: lib/applications.js's verifyApproval.
