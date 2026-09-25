import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { applicants, blocks, districts, officerJurisdictions } from '../db/schema/index.js'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// A saved report's location, as the Wizard stores it (stateId = state
// code, districtId/blockId = Census name slugs — see modules/geography),
// resolved to real district/block ids. Resolved server-side, never taken
// as ids from the client. Coded (real nationwide) rows win over any legacy
// uncoded duplicate name.
export async function resolveReportLocation(
  db: Db,
  inputs: Record<string, unknown>
): Promise<{ districtId: string | null; blockId: string | null }> {
  const stateId = str(inputs.stateId)
  const districtName = str(inputs.districtId)
  const blockName = str(inputs.blockId)
  if (!stateId || !districtName) return { districtId: null, blockId: null }
  const [district] = await db
    .select({ id: districts.id })
    .from(districts)
    .where(and(eq(districts.stateCode, stateId), eq(districts.name, districtName)))
    .orderBy(sql`${districts.code} is null`)
    .limit(1)
  if (!district) return { districtId: null, blockId: null }
  if (!blockName) return { districtId: district.id, blockId: null }
  const [block] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.districtId, district.id), eq(blocks.name, blockName)))
    .orderBy(sql`${blocks.code} is null`)
    .limit(1)
  return { districtId: district.id, blockId: block?.id ?? null }
}

// Active officers whose jurisdiction covers this block — the exact block
// ('block' scope) or the whole district ('district' scope) — sorted by id
// so tie-breaking is deterministic. Callers attach their own open-case
// counts (applications and appeals count separately).
export async function findCoveringOfficerIds(
  db: Db,
  districtId: string,
  blockId: string | null
): Promise<Array<{ officerId: string; scope: 'block' | 'district' }>> {
  const coverage = await db
    .select({ officerId: officerJurisdictions.officerId, blockId: officerJurisdictions.blockId })
    .from(officerJurisdictions)
    .innerJoin(applicants, eq(officerJurisdictions.officerId, applicants.id))
    .where(
      and(
        eq(officerJurisdictions.districtId, districtId),
        eq(applicants.role, 'officer'),
        eq(applicants.active, true),
        blockId ? or(isNull(officerJurisdictions.blockId), eq(officerJurisdictions.blockId, blockId)) : isNull(officerJurisdictions.blockId)
      )
    )
  const ids = [...new Set(coverage.map((c) => c.officerId))].sort()
  return ids.map((officerId) => ({
    officerId,
    scope: coverage.some((c) => c.officerId === officerId && c.blockId !== null) ? 'block' : 'district',
  }))
}
