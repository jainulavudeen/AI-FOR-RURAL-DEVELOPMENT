// Which role may open which page — the single table App.jsx's route guards,
// the navbar, and the sign-in page's "return to where you were" all read.
// UX only: the API enforces the same rules itself on every endpoint.
//
// Public (no entry here): '/', '/signin', '/verify/:hash', '/architecture'.
export const ALL_ROLES = ['applicant', 'officer', 'admin']

const RULES = [
  // A specific dossier is viewable by its applicant, the officer it's
  // assigned to, and admins (the server narrows "officer" further).
  { match: (p) => /^\/bank-dossier\/[^/]+$/.test(p), roles: ALL_ROLES },
  { match: (p) => p === '/account', roles: ALL_ROLES },
  { match: (p) => p === '/review' || p === '/partners', roles: ['officer'] },
  { match: (p) => p === '/admin', roles: ['admin'] },
  {
    match: (p) =>
      ['/dashboard', '/eligibility', '/results', '/compare', '/bahi-khata', '/credit-score', '/advisor-saathi', '/schemes', '/bank-dossier'].includes(p),
    roles: ['applicant'],
  },
]

export function rolesFor(pathname) {
  return RULES.find((r) => r.match(pathname))?.roles ?? null
}

// Only same-app paths are honoured as a post-sign-in destination (never
// "//evil.example" or an absolute URL — no open redirect), and only if
// the signed-in role may actually open it.
export function safeNextPath(next, role) {
  if (!next || typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/signin')) return null
  const pathname = next.split(/[?#]/)[0]
  const roles = rolesFor(pathname)
  if (roles && !roles.includes(role)) return null
  return next
}
