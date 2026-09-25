// Auth token storage + the sign-in calls (phone OTP, Google), account
// linking, and the profile refresh. Plain localStorage, no state library.
//
// The role/profile cached here is for rendering only — the API re-reads
// the role from the database on every request (apps/api plugins/auth.ts),
// so editing localStorage can change what the nav shows but never what the
// server allows. fetchMe() refreshes the cache from the server on load.
//
// Offline: a previously signed-in session stays usable with no network
// (the route guard only checks that a session exists), so the calculator
// keeps working offline on the ₹6,000 phone (CLAUDE.md rule 4). Only a
// brand-new sign-in needs connectivity.

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

const PROFILE_FIELDS = ['id', 'phone', 'email', 'displayName', 'designation', 'role', 'hasGoogle', 'hasPhone']

function pickProfile(applicant) {
  return Object.fromEntries(PROFILE_FIELDS.map((k) => [k, applicant?.[k] ?? null]))
}

function storeSignIn(result) {
  if (!result.ok) return result
  const session = {
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
    expiresAt: Date.now() + result.data.accessTokenExpiresIn * 1000,
    ...pickProfile(result.data.applicant),
  }
  writeSession(session)
  return { ...result, session }
}

export async function verifyOtp(phone, code) {
  return storeSignIn(await postJson('/auth/otp/verify', { phone, code }))
}

// Google Identity Services hands the page an opaque ID token
// (`credential`); the server verifies it with Google and decides who this
// is. Nothing else about the user is sent from here.
export async function signInWithGoogle(credential) {
  return storeSignIn(await postJson('/auth/google', { credential }))
}

// Public config: whether Google sign-in is enabled (and its client id).
export async function getAuthConfig() {
  try {
    const response = await fetch(`${API_BASE}/auth/config`)
    if (!response.ok) return { googleClientId: null }
    return await response.json()
  } catch {
    return { googleClientId: null }
  }
}

// Where each role lands after sign-in (and where the guard sends someone
// who opened a page their role can't use).
export function roleHome(role) {
  if (role === 'admin') return '/admin'
  if (role === 'officer') return '/review'
  return '/dashboard'
}

function mergeProfile(profile) {
  const session = readSession()
  if (!session) return null
  const next = { ...session, ...pickProfile(profile) }
  writeSession(next)
  return next
}

// Re-reads the profile (role included) from the server. Returns the
// updated session, `null` if the server says the session is no longer
// valid (then cleared), or `undefined` if the server couldn't be reached
// (offline — keep the cached session as-is).
export async function fetchMe() {
  if (!readSession()?.accessToken) return null
  try {
    const response = await authorizedFetch('/auth/me')
    if (response.status === 401 || response.status === 403) {
      clearSession()
      return null
    }
    if (!response.ok) return undefined
    return mergeProfile(await response.json())
  } catch {
    return undefined
  }
}

async function postAuthorized(path, body) {
  try {
    const response = await authorizedFetch(path, {
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

// Add Google / a phone to the signed-in account. The server refuses (409)
// if that Gmail/phone already belongs to a different account — accounts
// are never merged or duplicated silently.
export async function linkGoogle(credential) {
  const result = await postAuthorized('/auth/link/google', { credential })
  return result.ok ? { ...result, session: mergeProfile(result.data) } : result
}

export async function linkPhone(phone, code) {
  const result = await postAuthorized('/auth/link/phone', { phone, code })
  return result.ok ? { ...result, session: mergeProfile(result.data) } : result
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
