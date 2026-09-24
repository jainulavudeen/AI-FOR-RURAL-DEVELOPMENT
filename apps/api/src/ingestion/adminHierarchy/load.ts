import type { BlockRow, DistrictRow, ParsedAdminHierarchy } from './types'

export interface LoadDeps {
  // Bulk upsert, keyed on districts.code (the stable shrid2 prefix, not
  // name — CLAUDE.md item 8+9's design principle). Returns the real
  // district UUID for every code, so blocks can be inserted with a real
  // FK even though this is one ingestion pass, not two round trips per
  // row.
  upsertDistricts: (rows: DistrictRow[]) => Promise<Map<string, string>>
  upsertBlocks: (rows: Array<BlockRow & { districtId: string }>) => Promise<void>
}

export interface LoadResult {
  districtsLoaded: number
  blocksLoaded: number
  blocksSkippedNoDistrict: number
}

// Idempotent: both upserts key on `code`, so re-running against the same
// source file updates in place rather than duplicating. Districts always
// go first — a block with no matching district (shouldn't happen given
// parse.ts derives every block's districtCode from the same file, but
// never assumed) is skipped and counted, not silently dropped without a
// trace.
export async function loadAdminHierarchy(deps: LoadDeps, parsed: ParsedAdminHierarchy): Promise<LoadResult> {
  const districtIdByCode = await deps.upsertDistricts(parsed.districts)

  const blocksWithDistrictId: Array<BlockRow & { districtId: string }> = []
  let blocksSkippedNoDistrict = 0
  for (const block of parsed.blocks) {
    const districtId = districtIdByCode.get(block.districtCode)
    if (!districtId) {
      blocksSkippedNoDistrict += 1
      continue
    }
    blocksWithDistrictId.push({ ...block, districtId })
  }

  await deps.upsertBlocks(blocksWithDistrictId)

  return {
    districtsLoaded: parsed.districts.length,
    blocksLoaded: blocksWithDistrictId.length,
    blocksSkippedNoDistrict,
  }
}
