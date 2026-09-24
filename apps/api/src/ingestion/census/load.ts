import type { ValidCensusRow } from './types.js'

export interface UpsertVillageInput {
  blockId: string
  villageName: string
  latitude: number | null
  longitude: number | null
}

export interface UpsertAmenityInput {
  villageId: string
  facilityType: string
  distanceKm: number | null
  availableInVillage: boolean
  datasetVersionId: string
}

export interface LoadDeps {
  findOrCreateBlock: (districtId: string, blockName: string) => Promise<{ id: string }>
  // Sets villages.geom when coordinates are available — this is what
  // closes the DIGIPIN backfill's "no coordinates" gap.
  upsertVillageWithGeom: (input: UpsertVillageInput) => Promise<{ id: string }>
  upsertAmenity: (input: UpsertAmenityInput) => Promise<void>
}

export interface LoadResult {
  villagesLoaded: number
  villagesWithCoordinates: number
  amenitiesLoaded: number
}

// Idempotent: villages upsert on (block, name), amenities on (village,
// facility_type) — re-running with the same input updates in place.
export async function loadCensusRows(
  deps: LoadDeps,
  districtId: string,
  rows: ValidCensusRow[],
  datasetVersionId: string
): Promise<LoadResult> {
  const blockCache = new Map<string, string>()
  let villagesLoaded = 0
  let villagesWithCoordinates = 0
  let amenitiesLoaded = 0

  for (const row of rows) {
    let blockId = blockCache.get(row.blockName)
    if (!blockId) {
      const block = await deps.findOrCreateBlock(districtId, row.blockName)
      blockId = block.id
      blockCache.set(row.blockName, blockId)
    }

    const village = await deps.upsertVillageWithGeom({
      blockId,
      villageName: row.villageName,
      latitude: row.latitude,
      longitude: row.longitude,
    })
    villagesLoaded += 1
    if (row.latitude !== null && row.longitude !== null) villagesWithCoordinates += 1

    for (const amenity of row.amenities) {
      await deps.upsertAmenity({
        villageId: village.id,
        facilityType: amenity.facilityType,
        distanceKm: amenity.distanceKm,
        availableInVillage: amenity.availableInVillage,
        datasetVersionId,
      })
      amenitiesLoaded += 1
    }
  }

  return { villagesLoaded, villagesWithCoordinates, amenitiesLoaded }
}
