import { describe, expect, it } from 'vitest'
import { loadCensusRows, type LoadDeps } from './load'
import type { ValidCensusRow } from './types'

function makeFakeDb() {
  const blocksByName = new Map<string, string>()
  const villagesByKey = new Map<string, { id: string; latitude: number | null; longitude: number | null }>()
  const amenitiesByKey = new Map<string, { villageId: string; facilityType: string; distanceKm: number | null; datasetVersionId: string }>()
  let nextId = 1

  const deps: LoadDeps = {
    findOrCreateBlock: async (districtId, blockName) => {
      const key = `${districtId}|${blockName}`
      let id = blocksByName.get(key)
      if (!id) {
        id = `block-${nextId++}`
        blocksByName.set(key, id)
      }
      return { id }
    },
    upsertVillageWithGeom: async ({ blockId, villageName, latitude, longitude }) => {
      const key = `${blockId}|${villageName}`
      const existing = villagesByKey.get(key)
      const id = existing?.id ?? `village-${nextId++}`
      villagesByKey.set(key, { id, latitude, longitude })
      return { id }
    },
    upsertAmenity: async (input) => {
      const key = `${input.villageId}|${input.facilityType}`
      amenitiesByKey.set(key, {
        villageId: input.villageId,
        facilityType: input.facilityType,
        distanceKm: input.distanceKm,
        datasetVersionId: input.datasetVersionId,
      })
    },
  }

  return { deps, blocksByName, villagesByKey, amenitiesByKey }
}

const ROWS: ValidCensusRow[] = [
  {
    shrid2: 'x',
    villageName: 'Surappatti',
    blockName: 'Melur',
    latitude: 10.0053,
    longitude: 78.0737,
    amenities: [
      { facilityType: 'primary_school', availableInVillage: true, distanceKm: null },
      { facilityType: 'district_headquarters', availableInVillage: false, distanceKm: 64 },
    ],
  },
]

describe('loadCensusRows', () => {
  it('sets village coordinates from the parsed lat/lng', async () => {
    const { deps, villagesByKey } = makeFakeDb()
    const result = await loadCensusRows(deps, 'district-1', ROWS, 'version-1')
    expect(result.villagesWithCoordinates).toBe(1)
    const village = [...villagesByKey.values()][0]!
    expect(village.latitude).toBeCloseTo(10.0053)
  })

  it('running the load twice with identical input does not duplicate villages or amenities', async () => {
    const { deps, blocksByName, villagesByKey, amenitiesByKey } = makeFakeDb()

    await loadCensusRows(deps, 'district-1', ROWS, 'version-1')
    await loadCensusRows(deps, 'district-1', ROWS, 'version-2')

    expect(blocksByName.size).toBe(1)
    expect(villagesByKey.size).toBe(1)
    expect(amenitiesByKey.size).toBe(2) // primary_school + district_headquarters, not 4

    for (const amenity of amenitiesByKey.values()) {
      expect(amenity.datasetVersionId).toBe('version-2')
    }
  })
})
