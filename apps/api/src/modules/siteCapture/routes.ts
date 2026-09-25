import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { reports, siteCaptures } from '../../db/schema/index.js'
import { createSiteCapture, getSiteCapturesForReport, type SiteCaptureDeps } from './service.js'
import type { CreateSiteCaptureBody, SiteCapture } from './types.js'
import { officerCanSeeReport } from '../../lib/officerAccess.js'

function rowToSiteCapture(row: typeof siteCaptures.$inferSelect): SiteCapture {
  return {
    id: row.id,
    applicantId: row.applicantId,
    reportId: row.reportId,
    digipin: row.digipin,
    latitude: row.latitude,
    longitude: row.longitude,
    photoDataUrl: row.photoDataUrl,
    consentAt: row.consentAt.toISOString(),
    confirmedAddress: row.confirmedAddress,
    addressSource: row.addressSource as SiteCapture['addressSource'],
    createdAt: row.createdAt.toISOString(),
  }
}

// Gated behind fastify.authenticate — this is squarely a "saving" action
// (CLAUDE.md's auth boundary), same class as feedback's flag/appeal.
const siteCaptureRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: SiteCaptureDeps = {
    insertSiteCapture: async (input) => {
      const [row] = await fastify.db.insert(siteCaptures).values(input).returning()
      if (!row) throw new Error('Failed to insert site capture')
      return rowToSiteCapture(row)
    },
    getSiteCapturesByReportId: async (reportId) => {
      const rows = await fastify.db.select().from(siteCaptures).where(eq(siteCaptures.reportId, reportId))
      return rows.map(rowToSiteCapture)
    },
    officerCanSeeReport: (reportId, officerId) => officerCanSeeReport(fastify.db, reportId, officerId),
    getReportOwner: async (reportId) => {
      const [row] = await fastify.db.select({ applicantId: reports.applicantId }).from(reports).where(eq(reports.id, reportId)).limit(1)
      return row?.applicantId ?? null
    },
  }

  fastify.post<{ Body: CreateSiteCaptureBody }>('/', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const capture = await createSiteCapture(deps, request.user.sub, request.body ?? ({} as CreateSiteCaptureBody))
    return reply.status(201).send(capture)
  })

  fastify.get<{ Params: { reportId: string } }>(
    '/report/:reportId',
    { preHandler: [fastify.requireRole('applicant', 'officer', 'admin')] },
    async (request, reply) => {
      const captures = await getSiteCapturesForReport(deps, request.user.sub, request.user.role, request.params.reportId)
      return reply.status(200).send(captures)
    }
  )
}

export default siteCaptureRoutes
