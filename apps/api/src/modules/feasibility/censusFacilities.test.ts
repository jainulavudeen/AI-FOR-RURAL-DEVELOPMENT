import { describe, expect, it } from 'vitest'
import { summariseAmenities } from './censusFacilities.js'

describe('summariseAmenities', () => {
  it('collapses Census amenity rows into bank/market/school', () => {
    const result = summariseAmenities([
      { facilityType: 'commercial_bank', availableInVillage: false, distanceKm: null },
      { facilityType: 'cooperative_bank', availableInVillage: true, distanceKm: null },
      { facilityType: 'weekly_haat', availableInVillage: true, distanceKm: null },
      { facilityType: 'primary_school', availableInVillage: false, distanceKm: null },
    ])
    expect(result.bank).toEqual({ availableInVillage: true, distanceKm: 0 })
    expect(result.market).toEqual({ availableInVillage: true, distanceKm: 0 })
    expect(result.school).toEqual({ availableInVillage: false, distanceKm: null })
  })

  it('falls back to the recorded ATM distance only when no bank is in the village', () => {
    const result = summariseAmenities([
      { facilityType: 'commercial_bank', availableInVillage: false, distanceKm: null },
      { facilityType: 'nearest_atm_distance', availableInVillage: false, distanceKm: '7.5' },
    ])
    expect(result.bank).toEqual({ availableInVillage: false, distanceKm: 7.5 })
  })
})
