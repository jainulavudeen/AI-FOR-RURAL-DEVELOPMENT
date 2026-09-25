import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchMe, getSession, logout as logoutRequest } from '../lib/auth'

const AuthContext = createContext(null)

// Lives INSIDE BrowserRouter (see App.jsx) so that every gated action in
// the app — the navbar's Sign in, a page's own gate, "Flag this data",
// "Request human review" — funnels through requestLogin() to the ONE
// sign-in page (/signin), carrying where the user was so they land back
// there afterwards.
export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(() => getSession())

  // The role cached in localStorage is only a first-render hint — refresh
  // it from the server (which reads the DB) on load, so a role change or
  // deactivation shows up without waiting for the next sign-in. Offline,
  // fetchMe resolves undefined and the cached session is kept.
  useEffect(() => {
    if (!session?.accessToken) return
    let cancelled = false
    fetchMe().then((next) => {
      if (cancelled || next === undefined) return
      setSession(next)
    })
    return () => {
      cancelled = true
    }
    // Only on mount / sign-in — not on every profile merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  const login = useCallback((nextSession) => setSession(nextSession), [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setSession(null)
    navigate('/')
  }, [navigate])

  const requestLogin = useCallback(() => {
    const here = window.location.pathname + window.location.search
    const next = here.startsWith('/signin') ? '' : `?next=${encodeURIComponent(here)}`
    navigate(`/signin${next}`)
  }, [navigate])

  const value = useMemo(
    () => ({
      session,
      phone: session?.phone ?? null,
      email: session?.email ?? null,
      displayName: session?.displayName ?? null,
      role: session?.role ?? null,
      isAuthenticated: Boolean(session?.accessToken),
      login,
      logout,
      requestLogin,
    }),
    [session, login, logout, requestLogin]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
