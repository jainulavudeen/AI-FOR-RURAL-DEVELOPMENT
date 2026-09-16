// applicantId is deliberately absent — always request.user.sub, never
// client-supplied (same reasoning as feedback/types.ts).
export interface CreateSiteCaptureBody {
  reportId?: string | null
  digipin: string
  latitude: number
  longitude: number
  photoDataUrl: string
  // Explicit, affirmative consent captured client-side at the moment of
  // capture — the server refuses to store anything without it (see
  // service.ts). Not just a formality flag: it's the client's timestamp of
  // when consent was actually given, which the server persists verbatim.
  consentAt: string
}

export interface SiteCapture {
  id: string
  applicantId: string
  reportId: string | null
  digipin: string
  latitude: number
  longitude: number
  photoDataUrl: string
  consentAt: string
  createdAt: string
}
