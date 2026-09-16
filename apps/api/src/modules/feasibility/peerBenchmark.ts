import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { reports } from '../../db/schema'

// k-anonymity threshold: a benchmark bucket (businessId x districtId x
// verdictKey) is shown only when it contains outcomes from at least this
// many DISTINCT applicants. Below this, nothing is returned — not even a
// "too few" count, since revealing a small count in a small rural block is
// itself disclosive.
//
// Why 5, specifically: it's the long-standing statistical-disclosure-control
// floor used by national statistics agencies (the US Census Bureau's
// small-cell suppression rules, and the threshold most commonly cited
// following Sweeney's original k-anonymity work) for publishing aggregates
// over small populations. This app's cohorts are drawn from a single rural
// district/block and a single business type — populations where "the dairy
// farmers in this block who scored 'moderate'" can plausibly be a handful
// of specific, locally-known people. 5 is conservative enough that even a
// villager with informal knowledge of who applied can't map a bucket back
// to one identity, while still being small enough that real (if sparse)
// report data can clear the bar as this pilot grows.
export const K_ANONYMITY_THRESHOLD = 5

export interface PeerBenchmarkQuery {
  businessId: string
  districtId: string
  verdictKey: string
}

export interface SchemeDistributionEntry {
  schemeId: string
  count: number
}

export type PeerBenchmarkResult =
  | { available: false }
  | {
      available: true
      cohortSize: number
      medianScore: number
      schemeDistribution: SchemeDistributionEntry[]
    }

// `reports.inputs` is the raw wizard `selection` object as it stood when the
// report was saved (see feedback/service.ts's saveReport) — businessId and
// districtId live inside that jsonb blob, not as their own columns, so this
// reads them out with a jsonb `->>` extraction. `verdictKey` is a real
// top-level column already (a coarse 4-band scale by construction — see
// packages/core/feasibilityBaseline.ts's classifyVerdict), which doubles as
// this benchmark's score-band bucket: coarse enough not to over-fragment an
// already-small cohort.
export async function getPeerBenchmark(db: Db, query: PeerBenchmarkQuery): Promise<PeerBenchmarkResult> {
  const matches = and(
    sql`${reports.inputs} ->> 'businessId' = ${query.businessId}`,
    sql`${reports.inputs} ->> 'districtId' = ${query.districtId}`,
    eq(reports.verdictKey, query.verdictKey)
  )

  const [agg] = await db
    .select({
      cohortSize: sql<number>`count(distinct ${reports.applicantId})`,
      medianScore: sql<number>`percentile_cont(0.5) within group (order by ${reports.score})`,
    })
    .from(reports)
    .where(matches)

  const cohortSize = Number(agg?.cohortSize ?? 0)
  if (cohortSize < K_ANONYMITY_THRESHOLD) {
    return { available: false }
  }

  const schemeRows = await db
    .select({ schemeId: reports.matchedSchemeId, count: sql<number>`count(*)` })
    .from(reports)
    .where(matches)
    .groupBy(reports.matchedSchemeId)

  return {
    available: true,
    cohortSize,
    medianScore: Math.round(Number(agg?.medianScore ?? 0)),
    schemeDistribution: schemeRows.map((r) => ({ schemeId: r.schemeId, count: Number(r.count) })),
  }
}
