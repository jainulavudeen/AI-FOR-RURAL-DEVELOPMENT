import type { ValidFacilityRow } from './types'

export interface UpsertIndicatorInput {
  villageId: string
  sector: string
  indicatorName: string
  indicatorValue: string
  numericValue: number | null
  surveyYear: number
  datasetVersionId: string
}

export interface LoadDeps {
  // Villages are matched by (block name, village name) against what the
  // Census loader already created — Mission Antyodaya's village_code and
  // SHRUG's shrid2 are two different government coding schemes with no
  // crosswalk available (see CLAUDE.md), so name is the only shared key.
  findOrCreateBlock: (districtId: string, blockName: string) => Promise<{ id: string }>
  findOrCreateVillage: (blockId: string, villageName: string) => Promise<{ id: string }>
  upsertIndicator: (input: UpsertIndicatorInput) => Promise<void>
}

export interface LoadResult {
  villagesTouched: number
  indicatorsLoaded: number
}

// Idempotent on (village, sector, indicator, survey_year).
export async function loadFacilityRows(
  deps: LoadDeps,
  districtId: string,
  rows: ValidFacilityRow[],
  datasetVersionId: string
): Promise<LoadResult> {
  const blockCache = new Map<string, string>()
  const villagesTouched = new Set<string>()
  let indicatorsLoaded = 0

  for (const row of rows) {
    let blockId = blockCache.get(row.blockName)
    if (!blockId) {
      const block = await deps.findOrCreateBlock(districtId, row.blockName)
      blockId = block.id
      blockCache.set(row.blockName, blockId)
    }

    const village = await deps.findOrCreateVillage(blockId, row.villageName)
    villagesTouched.add(village.id)

    for (const indicator of row.indicators) {
      await deps.upsertIndicator({
        villageId: village.id,
        sector: row.sector,
        indicatorName: indicator.indicatorName,
        indicatorValue: indicator.indicatorValue,
        numericValue: indicator.numericValue,
        surveyYear: row.surveyYear,
        datasetVersionId,
      })
      indicatorsLoaded += 1
    }
  }

  return { villagesTouched: villagesTouched.size, indicatorsLoaded }
}
