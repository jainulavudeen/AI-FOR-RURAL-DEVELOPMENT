import { OAuth2Client } from 'google-auth-library'
import { env } from '../../config/env.js'
import type { VerifiedGoogleIdentity } from './service.js'

export type GoogleVerifyResult =
  | { ok: true; identity: VerifiedGoogleIdentity }
  | { ok: false; reason: 'not_configured' | 'invalid_token' | 'email_not_verified' }

export type GoogleIdTokenVerifier = (idToken: string) => Promise<GoogleVerifyResult>

// Verifies a Google Identity Services ID token SERVER-SIDE: Google's
// signature (keys fetched and cached by google-auth-library), `aud` ==
// our own GOOGLE_OAUTH_CLIENT_ID (so a token minted for some other app
// can't be replayed here), issuer, and expiry. Only a Google-verified
// email is accepted, because invite claiming matches on it. The client
// only ever hands us the opaque token — never a name/email/sub it claims.
export function createGoogleVerifier(clientId: string | undefined = env.GOOGLE_OAUTH_CLIENT_ID): GoogleIdTokenVerifier {
  if (!clientId) return async () => ({ ok: false, reason: 'not_configured' })
  const client = new OAuth2Client(clientId)

  return async (idToken) => {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId })
      const payload = ticket.getPayload()
      if (!payload?.sub || !payload.email) return { ok: false, reason: 'invalid_token' }
      if (payload.email_verified !== true) return { ok: false, reason: 'email_not_verified' }
      return {
        ok: true,
        identity: { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name ?? null },
      }
    } catch {
      return { ok: false, reason: 'invalid_token' }
    }
  }
}
