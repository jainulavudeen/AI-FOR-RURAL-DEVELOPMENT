// Auth token storage + the OTP request/verify/refresh calls. Plain
// localStorage, no state library — there was no existing client-side
// persistence pattern in this app to reuse (see CLAUDE.md), so this stays
// as lightweight as the rest of the client code.
//
// THE NON-NEGOTIABLE BOUNDARY: none of this gates the calculator. An
// unauthenticated user still gets a working offline report — this module
// is only consulted by features that need a verified phone (saving,
// appealing, notifications), never by Wizard/Results.

const STORAGE_KEY = 'setu.auth'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // localStorage unavailable (private mode, quota) — auth just won't
    // persist across reloads; the calculator is unaffected either way.
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // see writeSession
  }
}

async function postJson(path, body) {
  // A thrown fetch (offline, DNS failure, CORS block) must resolve to an
  // error result, not propagate — an unhandled rejection here would leave
  // the calling UI's loading state stuck forever. THE NON-NEGOTIABLE
  // BOUNDARY: a spinner that never resolves is not acceptable degradation.
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: { code: 'NETWORK_ERROR' } } }
  }
}

export async function requestOtp(phone) {
  return postJson('/auth/otp/request', { phone })
}

export async function verifyOtp(phone, code) {
  const result = await postJson('/auth/otp/verify', { phone, code })
  if (result.ok) {
    const session = {
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      phone: result.data.applicant.phone,
      role: result.data.applicant.role,
      expiresAt: Date.now() + result.data.accessTokenExpiresIn * 1000,
    }
    writeSession(session)
    return { ...result, session }
  }
  return result
}

export function getSession() {
  return readSession()
}

export function isAuthenticated() {
  const session = readSession()
  return Boolean(session?.accessToken)
}

export async function logout() {
  const session = readSession()
  clearSession()
  if (session?.refreshToken) {
    await postJson('/auth/logout', { refreshToken: session.refreshToken }).catch(() => {})
  }
}

async function refreshAccessToken() {
  const session = readSession()
  if (!session?.refreshToken) return null

  const result = await postJson('/auth/refresh', { refreshToken: session.refreshToken })
  if (!result.ok) {
    clearSession()
    return null
  }

  const next = { ...session, accessToken: result.data.accessToken, expiresAt: Date.now() + result.data.accessTokenExpiresIn * 1000 }
  writeSession(next)
  return next.accessToken
}

// Attaches the bearer token; on a 401, retries once through /auth/refresh,
// then gives up and clears the session rather than looping.
export async function authorizedFetch(path, options = {}) {
  const session = readSession()
  const headers = { ...options.headers }
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`
  }

  let response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (response.status === 401 && session?.refreshToken) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, Authorization: `Bearer ${newToken}` } })
    }
  }
  return response
}
