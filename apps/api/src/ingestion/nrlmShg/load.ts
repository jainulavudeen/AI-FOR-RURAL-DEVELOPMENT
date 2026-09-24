import type { ValidShgRow } from './types.js'

export interface UpsertShgInput {
  blockId: string
  socialCategory: string
  activeShgCount: number
  asOfDate: string
  datasetVersionId: string
}

export interface LoadDeps {
  findOrCreateBlock: (districtId: string, blockName: string) => Promise<{ id: string }>
  upsertShgCount: (input: UpsertShgInput) => Promise<void>
}

export interface LoadResult {
  loaded: number
}

// Idempotent on (block, social_category, as_of_date).
export async function loadShgRows(
  deps: LoadDeps,
  districtId: string,
  rows: ValidShgRow[],
  datasetVersionId: string
): Promise<LoadResult> {
  const blockCache = new Map<string, string>()
  let loaded = 0

  for (const row of rows) {
    let blockId = blockCache.get(row.blockName)
    if (!blockId) {
      const block = await deps.findOrCreateBlock(districtId, row.blockName)
      blockId = block.id
      blockCache.set(row.blockName, blockId)
    }

    await deps.upsertShgCount({
      blockId,
      socialCategory: row.socialCategory,
      activeShgCount: row.activeShgCount,
      asOfDate: row.asOfDate,
      datasetVersionId,
    })
    loaded += 1
  }

  return { loaded }
}
