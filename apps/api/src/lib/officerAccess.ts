import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { appeals, applicationDecisions, applications } from '../db/schema/index.js'

// "An officer sees only what's assigned to them" — the one shared answer
// for report-level reads (feedback's GET /reports/:id, siteCapture's
// evidence list). True if the report is on an application or appeal
// currently assigned to this officer, or on a decision they recorded.
export async function officerCanSeeReport(db: Db, reportId: string, officerId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return false
  const [viaApplication] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.reportId, reportId), eq(applications.assignedOfficerId, officerId)))
    .limit(1)
  if (viaApplication) return true
  const [viaAppeal] = await db
    .select({ id: appeals.id })
    .from(appeals)
    .where(and(eq(appeals.reportId, reportId), eq(appeals.assignedOfficerId, officerId)))
    .limit(1)
  if (viaAppeal) return true
  const [viaDecision] = await db
    .select({ id: applicationDecisions.id })
    .from(applicationDecisions)
    .where(and(eq(applicationDecisions.reportId, reportId), eq(applicationDecisions.officerId, officerId)))
    .limit(1)
  return Boolean(viaDecision)
}
