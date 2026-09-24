import { describe, expect, it } from 'vitest'
import type { RawFacilityRecord } from './types.js'
import { validateRows } from './validate.js'

// Field values below match a real Madurai-adjacent row observed in
// village-basic-facilities.csv (Tamil Nadu, Alanganallur block).
function record(overrides: Partial<RawFacilityRecord> = {}, fieldOverrides: Record<string, string> = {}): RawFacilityRecord {
  return {
    villageName: 'Sambakulam',
    blockName: 'Alanganallur',
    villageCode: '640760',
    sector: 'basic_facilities',
    surveyYear: '2020',
    indicatorFields: {
      banks: 'f',
      atm: 'f',
      all_weather_road_connectivity: 'f',
      internal_pucca_roads: 'Not covered',
      public_transport: 'No',
      market_facilities: '50 to 100% habitations covered',
      primary_school: 't',
      ...fieldOverrides,
    },
    ...overrides,
  }
}

describe('validateRows (Mission Antyodaya)', () => {
  it('loads a well-formed row, keeping BOOL/TEXT values as-is', () => {
    const { valid, rejected } = validateRows([record()])
    expect(rejected).toHaveLength(0)
    const row = valid[0]!
    expect(row.surveyYear).toBe(2020)
    const byName = Object.fromEntries(row.indicators.map((i) => [i.indicatorName, i]))
    expect(byName.banks).toEqual({ indicatorName: 'banks', indicatorValue: 'f', numericValue: null })
    expect(byName.internal_pucca_roads?.indicatorValue).toBe('Not covered')
  })

  it('opportunistically parses a genuinely numeric indicator value', () => {
    const { valid } = validateRows([record({}, { some_count_field: '42' })])
    const byName = Object.fromEntries(valid[0]!.indicators.map((i) => [i.indicatorName, i]))
    expect(byName.some_count_field).toEqual({ indicatorName: 'some_count_field', indicatorValue: '42', numericValue: 42 })
  })

  it('rejects a row missing village_code', () => {
    const { valid, rejected } = validateRows([record({ villageCode: '' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors).toContain('village_code is required')
  })

  it('rejects an invalid survey year rather than accepting it uncritically', () => {
    const { valid, rejected } = validateRows([record({ surveyYear: 'not-a-year' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors.some((e) => e.includes('year'))).toBe(true)
  })

  it('does not reject a row for a blank indicator value — real non-response, not an error', () => {
    const { valid, rejected } = validateRows([record({}, { some_field: '' })])
    expect(rejected).toHaveLength(0)
    const byName = Object.fromEntries(valid[0]!.indicators.map((i) => [i.indicatorName, i]))
    expect(byName.some_field).toEqual({ indicatorName: 'some_field', indicatorValue: '', numericValue: null })
  })
})
