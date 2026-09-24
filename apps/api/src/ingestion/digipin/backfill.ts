import { encodeDigipin } from './algorithm.js'

export interface VillageCoordinate {
  id: string
  lat: number
  lon: number
}

export interface BackfillDeps {
  findVillagesNeedingDigipin: () => Promise<VillageCoordinate[]>
  updateVillageDigipin: (villageId: string, digipin: string) => Promise<void>
}

export interface BackfillResult {
  updated: number
  failed: Array<{ id: string; error: string }>
}

// Real and correct, but only as useful as the coordinates available: given
// villages that have geom set but no digipin yet, compute and persist one.
// See CLAUDE.md — there is currently no confirmed coordinate source for
// Madurai's villages, so `findVillagesNeedingDigipin` may return zero rows
// until that changes; this is not a bug, it's the honest state of things.
export async function backfillDigipins(deps: BackfillDeps): Promise<BackfillResult> {
  const candidates = await deps.findVillagesNeedingDigipin()
  let updated = 0
  const failed: BackfillResult['failed'] = []

  for (const village of candidates) {
    try {
      const digipin = encodeDigipin(village.lat, village.lon)
      await deps.updateVillageDigipin(village.id, digipin)
      updated += 1
    } catch (err) {
      failed.push({ id: village.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { updated, failed }
}
