import { createContext, useContext, useMemo, useState } from 'react'
import { getSession, logout as logoutRequest } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession())
  const [loginRequested, setLoginRequested] = useState(false)
  const [returnTo, setReturnTo] = useState(null)

  const login = (nextSession) => setSession(nextSession)

  const logout = async () => {
    await logoutRequest()
    setSession(null)
  }

  // Lets any gated action anywhere in the app (Flag this data, Request
  // Human Review, a page's own signed-out gate) ask the single global
  // AuthModal to open, without those components needing to know it exists.
  // Captures the current URL via window.location (not useLocation) because
  // AuthProvider sits outside BrowserRouter — this still works since
  // BrowserRouter drives window.location itself.
  const requestLogin = () => {
    setReturnTo(window.location.pathname + window.location.search)
    setLoginRequested(true)
  }
  const clearLoginRequest = () => {
    setLoginRequested(false)
    setReturnTo(null)
  }

  const value = useMemo(
    () => ({
      phone: session?.phone ?? null,
      role: session?.role ?? null,
      isAuthenticated: Boolean(session?.accessToken),
      login,
      logout,
      loginRequested,
      returnTo,
      requestLogin,
      clearLoginRequest,
    }),
    [session, loginRequested, returnTo]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
