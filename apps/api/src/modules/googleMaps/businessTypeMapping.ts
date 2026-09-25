// Business type -> Google Places (New) search, for the live competition-
// density lookup. Every `includedTypes` value below was checked against
// Google's own Table A list (places/web-service/place-types) — Table A
// types are the only ones Nearby Search accepts as a filter.
//
// Where no Table A type genuinely fits, the entry falls back to a Text
// Search query instead of forcing a misleading type:
//   - dairy: Google has no dairy type; 'farm' would count every farm.
//   - poultry: 'butcher_shop' is meat retail — often a *buyer* of a
//     poultry unit's output, not a competitor.
// Mapping reviewed and approved by the user before this was written.
export type CompetitionQuery =
  | { method: 'place_type'; includedTypes: string[] }
  | { method: 'text_search'; textQuery: string }

export const BUSINESS_TYPE_COMPETITION_QUERY: Record<string, CompetitionQuery> = {
  dairy: { method: 'text_search', textQuery: 'dairy milk' },
  retail: { method: 'place_type', includedTypes: ['grocery_store', 'convenience_store', 'supermarket', 'general_store'] },
  textiles: { method: 'place_type', includedTypes: ['clothing_store', 'tailor'] },
  poultry: { method: 'text_search', textQuery: 'poultry chicken farm' },
  manufacturing: { method: 'place_type', includedTypes: ['manufacturer'] },
}

// Nearest-facility lookup (Census 2011 vs live road distance). Same Table
// A check applies.
export type FacilityCategory = 'bank' | 'market' | 'school'

export const FACILITY_PLACE_TYPES: Record<FacilityCategory, string[]> = {
  bank: ['bank'],
  market: ['market', 'farmers_market'],
  school: ['school', 'primary_school', 'secondary_school'],
}

export const FACILITY_CATEGORIES: FacilityCategory[] = ['bank', 'market', 'school']

export function facilityCategoryForTypes(types: string[]): FacilityCategory | null {
  for (const category of FACILITY_CATEGORIES) {
    if (FACILITY_PLACE_TYPES[category].some((t) => types.includes(t))) return category
  }
  return null
}
