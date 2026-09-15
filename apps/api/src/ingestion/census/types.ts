// Real shape, verified against actual Madurai rows and the SHRUG metadata
// before this was written (see CLAUDE.md) — not a guess. Three files
// joined on shrid2: shrid_loc_names.csv (names), shrid2_spatial_stats.csv
// (real lat/lng), pc11_vd_clean_shrid.csv (the Census 2011 Village
// Directory amenity columns themselves).
export interface RawCensusRecord {
  shrid2: string
  villageName: string
  blockName: string // Census "subdistrict" — this is our block grain
  latitude: string | null
  longitude: string | null
  amenityFields: Record<string, string>
}

export interface CensusAmenity {
  facilityType: string
  availableInVillage: boolean
  distanceKm: number | null
}

export interface ValidCensusRow {
  shrid2: string
  villageName: string
  blockName: string
  latitude: number | null
  longitude: number | null
  amenities: CensusAmenity[]
}

export interface RowValidationError {
  shrid2: string
  errors: string[]
}
