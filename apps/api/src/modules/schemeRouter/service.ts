// Project cost + category -> scheme, including the dedicated corporations
// (NSFDC, NBCFDC, NSKFDC, NHFDC, SEED, ...). @setu/core's SCHEMES/
// getMatchingSocialSchemes is the static default; once wired for real this
// module reads the versioned scheme_rules DB table instead so routing
// reflects the rule set in force when a report is generated. Not wired yet.
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { schemeRules } from '../../db/schema'

export interface SchemeRuleVersion {
  id: string
  schemeId: string
  version: number
}

// The scheme_rules row currently in force for a scheme — "current" means
// effective_to IS NULL (see CLAUDE.md: scheme rules are versioned, never
// mutated in place; closing one out means setting effective_to). Used by
// the feedback module when persisting a report, so reports.scheme_rules_version
// always points at the exact rule row that was active when the report was made.
export async function getCurrentSchemeRuleVersion(db: Db, schemeId: string): Promise<SchemeRuleVersion | null> {
  const [row] = await db
    .select({ id: schemeRules.id, schemeId: schemeRules.schemeId, version: schemeRules.version })
    .from(schemeRules)
    .where(and(eq(schemeRules.schemeId, schemeId), isNull(schemeRules.effectiveTo)))
    .orderBy(desc(schemeRules.version))
    .limit(1)

  return row ?? null
}
