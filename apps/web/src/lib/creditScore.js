// GET /credit-score/me — the server-audited mirror of computeCreditScore()
// (see @setu/core's creditScore.ts), read from the applicant's own
// DB-stored ledger rows so it can't be spoofed client-side. The Credit
// Score page's live simulator does NOT call this on every slider drag —
// it recomputes the same @setu/core function locally against the already-
// fetched /ledger/summary data, so dragging a slider costs zero network
// round-trips. This call is only for the page's initial "real" score.

import { authorizedFetch } from './auth'

export async function getCreditScore() {
  try {
    const response = await authorizedFetch('/credit-score/me')
    const data = await response.json().catch(() => null)
    return { ok: response.ok, data }
  } catch {
    return { ok: false, data: null }
  }
}
