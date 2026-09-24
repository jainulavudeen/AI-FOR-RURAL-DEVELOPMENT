import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../../db/client.js'
import { blocks, datasetVersions, shgRegistry } from '../../db/schema/index.js'
import type { DataBackedFactor } from './types.js'

const NEUTRAL: DataBackedFactor = { value: 0, label: 'neutral', asOf: null, datasetVersionId: null }
const SHG_SATURATION_COUNT = 20 // active SHGs at/above this reads as the top of the range
const SHG_RANGE = 10 // -5..5, matching the old seeded marketFactor range

async function computeFromBlockIds(db: Db, blockIds: string[]): Promise<Omit<DataBackedFactor, 'label'> | null> {
  if (blockIds.length === 0) return null

  const rows = await db
    .select({
      blockId: shgRegistry.blockId,
      socialCategory: shgRegistry.socialCategory,
      activeShgCount: shgRegistry.activeShgCount,
      datasetVersionId: shgRegistry.datasetVersionId,
      vintageLabel: datasetVersions.vintageLabel,
    })
    .from(shgRegistry)
    .innerJoin(datasetVersions, eq(shgRegistry.datasetVersionId, datasetVersions.id))
    .where(inArray(shgRegistry.blockId, blockIds))

  if (rows.length === 0) return null

  // 'total' rows only, one per block that has any — summed across every
  // block in scope (a single block for the block-level call, every block
  // in the district for the district-level fallback).
  const totals = rows.filter((r) => r.socialCategory === 'total')
  const relevant = totals.length > 0 ? totals : rows
  const activeShgCount = relevant.reduce((sum, r) => sum + r.activeShgCount, 0)
  const saturation = Math.min(activeShgCount / SHG_SATURATION_COUNT, 1)
  const value = Math.round((saturation - 0.5) * SHG_RANGE)
  const first = relevant[0]!

  return { value, asOf: first.vintageLabel, datasetVersionId: first.datasetVersionId }
}

// NRLM SHG-registry-backed market signal: more active Self-Help Groups
// reads as more community financial infrastructure. shg_registry has zero
// rows loaded today (CLAUDE.md Known Gap — no working NRLM source was ever
// found), so this honestly resolves to neutral everywhere until that
// changes — the block-then-district fallback (same shape as
// infraSignal.ts) is real, tested plumbing, ready for whenever a real
// source exists. Never throws (rule 4).
export async function getShgSignal(db: Db, districtId: string | null, blockId: string | null): Promise<DataBackedFactor> {
  try {
    if (blockId) {
      const blockResult = await computeFromBlockIds(db, [blockId])
      if (blockResult) return { ...blockResult, label: 'real_block' }
    }
    if (districtId) {
      const districtBlocks = await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.districtId, districtId))
      const districtResult = await computeFromBlockIds(db, districtBlocks.map((b) => b.id))
      if (districtResult) return { ...districtResult, label: 'real_district' }
    }
    return NEUTRAL
  } catch {
    return NEUTRAL
  }
}
