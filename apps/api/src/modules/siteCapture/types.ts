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
  // Optional — see db/schema/siteCaptures.ts. Only ever what the user
  // confirmed or typed, never a raw Google suggestion.
  confirmedAddress?: string | null
  addressSource?: SiteAddressSource | null
}

export type SiteAddressSource = 'user_confirmed' | 'user_corrected' | 'user_entered'

export interface SiteCapture {
  id: string
  applicantId: string
  reportId: string | null
  digipin: string
  latitude: number
  longitude: number
  photoDataUrl: string
  consentAt: string
  confirmedAddress: string | null
  addressSource: SiteAddressSource | null
  createdAt: string
}
