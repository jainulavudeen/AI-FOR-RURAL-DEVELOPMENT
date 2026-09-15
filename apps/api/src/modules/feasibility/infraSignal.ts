import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { datasetVersions, villageAmenities, villages } from '../../db/schema'
import type { DataBackedFactor } from './types'

const NEUTRAL: DataBackedFactor = { value: 0, label: 'neutral', asOf: null, datasetVersionId: null }
const INFRA_RANGE = 12 // -6..6, matching the old seeded infraFactor range

// Census 2011 village_amenities-backed infrastructure signal: what fraction
// of this block's (village, facility) rows have the facility available in
// the village itself. Never throws (rule 4) — no resolved block, no
// villages, no amenity rows, or a DB error all degrade to neutral, exactly
// like getLocalDemandSignal's Agmarknet-down case.
export async function getInfraSignal(db: Db, blockId: string | null): Promise<DataBackedFactor> {
  if (!blockId) return NEUTRAL

  try {
    const blockVillages = await db.select({ id: villages.id }).from(villages).where(eq(villages.blockId, blockId))
    if (blockVillages.length === 0) return NEUTRAL

    const villageIds = blockVillages.map((v) => v.id)
    const amenityRows = await db
      .select({
        availableInVillage: villageAmenities.availableInVillage,
        datasetVersionId: villageAmenities.datasetVersionId,
        vintageLabel: datasetVersions.vintageLabel,
      })
      .from(villageAmenities)
      .innerJoin(datasetVersions, eq(villageAmenities.datasetVersionId, datasetVersions.id))
      .where(inArray(villageAmenities.villageId, villageIds))

    if (amenityRows.length === 0) return NEUTRAL

    const availableCount = amenityRows.filter((r) => r.availableInVillage).length
    const availabilityRatio = availableCount / amenityRows.length
    const value = Math.round((availabilityRatio - 0.5) * INFRA_RANGE)
    const first = amenityRows[0]!

    return { value, label: 'real', asOf: first.vintageLabel, datasetVersionId: first.datasetVersionId }
  } catch {
    return NEUTRAL
  }
}
