// POST /bank-statement/upload — a real, connectivity-required action (it
// uploads a file and runs server-side PDF extraction), so unlike
// lib/ledger.js's recordTransaction, a thrown fetch here is reported as a
// genuine failure, never "queued": replaying a stale file upload later
// with no user present to see the result would be confusing, not helpful.

import { authorizedFetch } from './auth'

export async function uploadBankStatement(file) {
  try {
    const formData = new FormData()
    formData.append('file', file, file.name)
    const response = await authorizedFetch('/bank-statement/upload', {
      method: 'POST',
      body: formData,
    })
    const data = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}
