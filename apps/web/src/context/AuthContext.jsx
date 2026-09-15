import { createContext, useContext, useMemo, useState } from 'react'
import { getSession, logout as logoutRequest } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => getSession())
  const [loginRequested, setLoginRequested] = useState(false)

  const login = (nextSession) => setSession(nextSession)

  const logout = async () => {
    await logoutRequest()
    setSession(null)
  }

  // Lets a gated action (Flag this data, Request Human Review) ask the
  // navbar's sign-in popover to open, without those components needing to
  // know OtpLogin exists.
  const requestLogin = () => setLoginRequested(true)
  const clearLoginRequest = () => setLoginRequested(false)

  const value = useMemo(
    () => ({
      phone: session?.phone ?? null,
      role: session?.role ?? null,
      isAuthenticated: Boolean(session?.accessToken),
      login,
      logout,
      loginRequested,
      requestLogin,
      clearLoginRequest,
    }),
    [session, loginRequested]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
