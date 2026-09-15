import { describe, expect, it } from 'vitest'
import type { RawCensusRecord } from './types'
import { validateRows } from './validate'

// Field values below match what was actually observed in Madurai rows of
// pc11_vd_clean_shrid.csv (not invented): "1.0"/"0.0" presence strings,
// numeric-or-empty distance fields.
function record(overrides: Partial<RawCensusRecord> = {}, fieldOverrides: Record<string, string> = {}): RawCensusRecord {
  return {
    shrid2: '11-33-623-05835-640481',
    villageName: 'Surappatti',
    blockName: 'Melur',
    latitude: '10.005251432553273',
    longitude: '78.07365620498102',
    amenityFields: {
      pc11_vd_p_sch_gov_status: '1.0',
      pc11_vd_p_sch_priv_status: '0.0',
      pc11_vd_m_sch_gov_status: '1.0',
      pc11_vd_m_sch_priv_status: '0.0',
      pc11_vd_s_sch_gov_status: '0.0',
      pc11_vd_s_sch_priv_status: '0.0',
      pc11_vd_atm: '0.0',
      pc11_vd_comm_bank: '0.0',
      pc11_vd_coop_bank: '0.0',
      pc11_vd_mrkt: '0.0',
      pc11_vd_wkl_haat: '0.0',
      pc11_vd_subdistrict_hq_dist: '35.0',
      pc11_vd_district_hq_dist: '64.0',
      pc11_vd_town_dist: '',
      pc11_vd_atm_dist: '',
      ...fieldOverrides,
    },
    ...overrides,
  }
}

describe('validateRows (Census/SHRUG)', () => {
  it('parses a real-shaped row into the expected amenity facts', () => {
    const { valid, rejected } = validateRows([record()])
    expect(rejected).toHaveLength(0)
    const row = valid[0]!
    expect(row.latitude).toBeCloseTo(10.0053, 3)
    expect(row.longitude).toBeCloseTo(78.0737, 3)

    const byType = Object.fromEntries(row.amenities.map((a) => [a.facilityType, a]))
    expect(byType.primary_school).toEqual({ facilityType: 'primary_school', availableInVillage: true, distanceKm: null })
    expect(byType.secondary_school).toEqual({ facilityType: 'secondary_school', availableInVillage: false, distanceKm: null })
    expect(byType.subdistrict_headquarters).toEqual({
      facilityType: 'subdistrict_headquarters',
      availableInVillage: false,
      distanceKm: 35,
    })
    expect(byType.nearest_town).toEqual({ facilityType: 'nearest_town', availableInVillage: false, distanceKm: null })
  })

  it('treats a private-school presence as satisfying the school amenity even if govt is absent', () => {
    const { valid } = validateRows([record({}, { pc11_vd_p_sch_gov_status: '0.0', pc11_vd_p_sch_priv_status: '1.0' })])
    const byType = Object.fromEntries(valid[0]!.amenities.map((a) => [a.facilityType, a]))
    expect(byType.primary_school?.availableInVillage).toBe(true)
  })

  it('rejects a row missing village_name', () => {
    const { valid, rejected } = validateRows([record({ villageName: '' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors).toContain('village_name is required')
  })

  it('rejects a row missing shrid2', () => {
    const { valid, rejected } = validateRows([record({ shrid2: '' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors).toContain('shrid2 is required')
  })

  it('loads a village with no matched coordinates as latitude/longitude null, not rejected', () => {
    const { valid, rejected } = validateRows([record({ latitude: null, longitude: null })])
    expect(rejected).toHaveLength(0)
    expect(valid[0]?.latitude).toBeNull()
    expect(valid[0]?.longitude).toBeNull()
  })
})
