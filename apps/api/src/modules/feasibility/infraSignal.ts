import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { blocks, datasetVersions, villageAmenities, villages } from '../../db/schema/index.js'
import type { DataBackedFactor } from './types.js'

const NEUTRAL: DataBackedFactor = { value: 0, label: 'neutral', asOf: null, datasetVersionId: null }
const INFRA_RANGE = 12 // -6..6, matching the old seeded infraFactor range

async function villageIdsForBlock(db: Db, blockId: string): Promise<string[]> {
  const rows = await db.select({ id: villages.id }).from(villages).where(eq(villages.blockId, blockId))
  return rows.map((v) => v.id)
}

async function villageIdsForDistrict(db: Db, districtId: string): Promise<string[]> {
  const districtBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.districtId, districtId))
  if (districtBlocks.length === 0) return []
  const rows = await db
    .select({ id: villages.id })
    .from(villages)
    .where(inArray(villages.blockId, districtBlocks.map((b) => b.id)))
  return rows.map((v) => v.id)
}

async function computeFromVillageIds(db: Db, villageIds: string[]): Promise<Omit<DataBackedFactor, 'label'> | null> {
  if (villageIds.length === 0) return null

  const amenityRows = await db
    .select({
      availableInVillage: villageAmenities.availableInVillage,
      datasetVersionId: villageAmenities.datasetVersionId,
      vintageLabel: datasetVersions.vintageLabel,
    })
    .from(villageAmenities)
    .innerJoin(datasetVersions, eq(villageAmenities.datasetVersionId, datasetVersions.id))
    .where(inArray(villageAmenities.villageId, villageIds))

  if (amenityRows.length === 0) return null

  const availableCount = amenityRows.filter((r) => r.availableInVillage).length
  const availabilityRatio = availableCount / amenityRows.length
  const value = Math.round((availabilityRatio - 0.5) * INFRA_RANGE)
  const first = amenityRows[0]!

  return { value, asOf: first.vintageLabel, datasetVersionId: first.datasetVersionId }
}

// Census 2011 village_amenities-backed infrastructure signal: what fraction
// of the relevant villages' (village, facility) rows have the facility
// available in the village itself. Tries the applicant's actual block
// first; if that doesn't resolve (the mock catalogue's block names don't
// match real ingested block names — see types.ts), falls back to
// aggregating over every village in the district, honestly labelled
// 'real_district' rather than pretending block-level precision. Never
// throws (rule 4) — no resolved district/block, no villages, no amenity
// rows, or a DB error all degrade to neutral.
export async function getInfraSignal(db: Db, districtId: string | null, blockId: string | null): Promise<DataBackedFactor> {
  try {
    if (blockId) {
      const blockResult = await computeFromVillageIds(db, await villageIdsForBlock(db, blockId))
      if (blockResult) return { ...blockResult, label: 'real_block' }
    }
    if (districtId) {
      const districtResult = await computeFromVillageIds(db, await villageIdsForDistrict(db, districtId))
      if (districtResult) return { ...districtResult, label: 'real_district' }
    }
    return NEUTRAL
  } catch {
    return NEUTRAL
  }
}
