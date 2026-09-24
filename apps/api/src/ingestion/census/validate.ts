import type { CensusAmenity, RawCensusRecord, RowValidationError, ValidCensusRow } from './types.js'

export interface ValidationOutcome {
  valid: ValidCensusRow[]
  rejected: RowValidationError[]
}

// SHRUG's pc11_vd_clean_shrid.csv encodes presence as the strings "1.0"/
// "0.0" (verified against real Madurai rows, not assumed).
function isPresent(value: string | undefined): boolean {
  return value === '1.0' || value === '1'
}

function parseDistance(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// A missing individual amenity field is a legitimate real Census
// non-response, not a validation failure — it's loaded as "unknown"
// (absent), not rejected. Only a genuinely unusable row (no name, no
// shrid2) is rejected outright. Known imprecision, not hidden: a
// presence flag reading "0.0" and one that's simply blank are both
// treated as availableInVillage: false here — the source doesn't let us
// tell "confirmed absent" from "not recorded" apart at this pass.
export function validateRows(rows: RawCensusRecord[]): ValidationOutcome {
  const valid: ValidCensusRow[] = []
  const rejected: RowValidationError[] = []

  for (const row of rows) {
    const errors: string[] = []
    if (!row.shrid2?.trim()) errors.push('shrid2 is required')
    if (!row.villageName?.trim()) errors.push('village_name is required')
    if (!row.blockName?.trim()) errors.push('block_name (subdistrict) is required')

    if (errors.length > 0) {
      rejected.push({ shrid2: row.shrid2 || '(missing)', errors })
      continue
    }

    const f = row.amenityFields
    const subdistrictHqDist = parseDistance(f.pc11_vd_subdistrict_hq_dist)
    const districtHqDist = parseDistance(f.pc11_vd_district_hq_dist)
    const townDist = parseDistance(f.pc11_vd_town_dist)
    const atmDist = parseDistance(f.pc11_vd_atm_dist)

    const amenities: CensusAmenity[] = [
      {
        facilityType: 'primary_school',
        availableInVillage: isPresent(f.pc11_vd_p_sch_gov_status) || isPresent(f.pc11_vd_p_sch_priv_status),
        distanceKm: null,
      },
      {
        facilityType: 'middle_school',
        availableInVillage: isPresent(f.pc11_vd_m_sch_gov_status) || isPresent(f.pc11_vd_m_sch_priv_status),
        distanceKm: null,
      },
      {
        facilityType: 'secondary_school',
        availableInVillage: isPresent(f.pc11_vd_s_sch_gov_status) || isPresent(f.pc11_vd_s_sch_priv_status),
        distanceKm: null,
      },
      { facilityType: 'atm', availableInVillage: isPresent(f.pc11_vd_atm), distanceKm: null },
      { facilityType: 'commercial_bank', availableInVillage: isPresent(f.pc11_vd_comm_bank), distanceKm: null },
      { facilityType: 'cooperative_bank', availableInVillage: isPresent(f.pc11_vd_coop_bank), distanceKm: null },
      { facilityType: 'market', availableInVillage: isPresent(f.pc11_vd_mrkt), distanceKm: null },
      { facilityType: 'weekly_haat', availableInVillage: isPresent(f.pc11_vd_wkl_haat), distanceKm: null },
      { facilityType: 'subdistrict_headquarters', availableInVillage: subdistrictHqDist === 0, distanceKm: subdistrictHqDist },
      { facilityType: 'district_headquarters', availableInVillage: districtHqDist === 0, distanceKm: districtHqDist },
      { facilityType: 'nearest_town', availableInVillage: townDist === 0, distanceKm: townDist },
      { facilityType: 'nearest_atm_distance', availableInVillage: atmDist === 0, distanceKm: atmDist },
    ]

    valid.push({
      shrid2: row.shrid2,
      villageName: row.villageName.trim(),
      blockName: row.blockName.trim(),
      latitude: row.latitude !== null ? Number(row.latitude) : null,
      longitude: row.longitude !== null ? Number(row.longitude) : null,
      amenities,
    })
  }

  return { valid, rejected }
}
