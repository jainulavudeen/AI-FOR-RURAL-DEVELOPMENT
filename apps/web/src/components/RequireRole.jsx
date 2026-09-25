import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleHome } from '../lib/auth'

// Route guard. UX only — the API enforces every role check itself
// (fastify.requireRole reads the role from the database), so a user who
// bypasses this still gets a 403 from the server.
//
// Signed out → the sign-in page, remembering where they were going.
// Signed in with the wrong role → their own home, not an error page.
// Checks only that a session EXISTS (not that the token is fresh), so a
// previously signed-in applicant keeps a working calculator offline.
export default function RequireRole({ roles, children }) {
  const { isAuthenticated, role } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/signin?next=${next}`} replace />
  }
  if (roles && !roles.includes(role)) {
    return <Navigate to={roleHome(role)} replace />
  }
  return children
}
