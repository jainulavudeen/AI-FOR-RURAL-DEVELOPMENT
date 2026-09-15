import { eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { datasetVersions, shgRegistry } from '../../db/schema'
import type { DataBackedFactor } from './types'

const NEUTRAL: DataBackedFactor = { value: 0, label: 'neutral', asOf: null, datasetVersionId: null }
const SHG_SATURATION_COUNT = 20 // active SHGs at/above this reads as the top of the range
const SHG_RANGE = 10 // -5..5, matching the old seeded marketFactor range

// NRLM SHG-registry-backed market signal: more active Self-Help Groups in a
// block reads as more community financial infrastructure. shg_registry has
// zero rows loaded today (CLAUDE.md Known Gap — no working NRLM source was
// ever found), so this honestly resolves to neutral everywhere until that
// changes; the plumbing is real and never throws (rule 4).
export async function getShgSignal(db: Db, blockId: string | null): Promise<DataBackedFactor> {
  if (!blockId) return NEUTRAL

  try {
    const rows = await db
      .select({
        socialCategory: shgRegistry.socialCategory,
        activeShgCount: shgRegistry.activeShgCount,
        datasetVersionId: shgRegistry.datasetVersionId,
        vintageLabel: datasetVersions.vintageLabel,
      })
      .from(shgRegistry)
      .innerJoin(datasetVersions, eq(shgRegistry.datasetVersionId, datasetVersions.id))
      .where(eq(shgRegistry.blockId, blockId))

    if (rows.length === 0) return NEUTRAL

    const totalRow = rows.find((r) => r.socialCategory === 'total') ?? rows[0]!
    const saturation = Math.min(totalRow.activeShgCount / SHG_SATURATION_COUNT, 1)
    const value = Math.round((saturation - 0.5) * SHG_RANGE)

    return { value, label: 'real', asOf: totalRow.vintageLabel, datasetVersionId: totalRow.datasetVersionId }
  } catch {
    return NEUTRAL
  }
}
