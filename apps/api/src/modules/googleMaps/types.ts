import type { FacilityCategory } from './businessTypeMapping.js'
import type { ProviderAttribution } from './provider.js'

// None of these shapes carries a place name, rating, review, photo, phone
// number or stored address — only counts, distances, times and place_ids.
//
// `source` says whose data it is (drives the attribution shown: "Google
// Maps" vs "© OpenStreetMap contributors"); `provider` says whether it's
// real or the keyless demo mock.
export type MapDataSource = 'google' | 'openstreetmap'

export interface CompetitionDensity {
  // unique places across the business type's searches
  count: number
  // true when any single search hit Google's 20-result page ceiling, so the
  // real number may be higher — shown as "{count} or more"
  capped: boolean
  source: 'google'
  method: 'place_type' | 'text_search'
  searchedFor: string[]
  radiusKm: number
  retrievedAt: string
  provider: 'mock' | 'real'
}

export interface FacilityDistance {
  // exactly one of these, matching NearestFacilities.source
  placeId?: string
  osmRef?: string
  straightLineKm: number
  roadDistanceKm: number | null
  travelMinutes: number | null
}

export interface NearestFacilities {
  facilities: Partial<Record<FacilityCategory, FacilityDistance>>
  source: MapDataSource
  retrievedAt: string
  provider: 'mock' | 'real'
  attributions: ProviderAttribution[]
}

export interface SiteAddressSuggestion {
  address: string
  source: MapDataSource
  provider: 'mock' | 'real'
  retrievedAt: string
}

export interface ReportEnhancement {
  competition: CompetitionDensity | null
  nearestFacilities: NearestFacilities | null
}
