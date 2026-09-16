import { desc, eq, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { applicants, appeals, feedbackFlags, reports } from '../../db/schema'
import { getCurrentSchemeRuleVersion } from '../schemeRouter/service'
import {
  createAppeal,
  createFlag,
  getOfficerQueue as getOfficerQueueService,
  saveReport,
  updateAppealStatus,
  type Appeal,
  type FeedbackDeps,
  type OfficerLoad,
} from './service'
import type { AppealRequestBody, AppealStatus, FlagRequestBody, UpdateAppealBody } from './types'

const VALID_STATUSES: AppealStatus[] = ['pending', 'assigned', 'in_review', 'resolved', 'rejected']

function rowToAppeal(row: typeof appeals.$inferSelect): Appeal {
  return {
    id: row.id,
    applicantId: row.applicantId,
    reportId: row.reportId,
    status: row.status as AppealStatus,
    assignedOfficerId: row.assignedOfficerId,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// "Flag this data" and "Request human review" are gated — see CLAUDE.md
// / apps/api/src/plugins/auth.ts: auth gates saving, appealing, and
// notifications, never the deterministic calculator.
const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: FeedbackDeps = {
    insertFeedbackFlag: async ({ applicantId, sourceTable, sourceRowId, reason }) => {
      const [row] = await fastify.db
        .insert(feedbackFlags)
        .values({ applicantId, sourceTable, sourceRowId, reason })
        .returning({ id: feedbackFlags.id })
      if (!row) throw new Error('Failed to insert feedback flag')
      return row
    },

    getCurrentSchemeRuleVersion: (schemeId) => getCurrentSchemeRuleVersion(fastify.db, schemeId),

    insertReport: async (input) => {
      const [row] = await fastify.db
        .insert(reports)
        .values({
          applicantId: input.applicantId,
          inputs: input.inputs,
          score: input.score,
          verdictKey: input.verdictKey,
          matchedSchemeId: input.matchedSchemeId,
          schemeRulesVersion: input.schemeRulesVersionId,
          emiSchedule: input.emiSchedule,
          dataVintage: input.dataVintage,
        })
        .returning({ id: reports.id })
      if (!row) throw new Error('Failed to insert report')
      return row
    },

    getOfficerLoads: async (): Promise<OfficerLoad[]> => {
      const rows = await fastify.db
        .select({
          officerId: applicants.id,
          openCount: sql<number>`count(${appeals.id}) filter (where ${appeals.status} not in ('resolved', 'rejected'))`,
        })
        .from(applicants)
        .leftJoin(appeals, eq(appeals.assignedOfficerId, applicants.id))
        .where(eq(applicants.role, 'officer'))
        .groupBy(applicants.id)
      return rows.map((r) => ({ officerId: r.officerId, openCount: Number(r.openCount) }))
    },

    insertAppeal: async ({ applicantId, reportId, assignedOfficerId }) => {
      const [row] = await fastify.db
        .insert(appeals)
        .values({ applicantId, reportId, assignedOfficerId, status: 'pending' })
        .returning()
      if (!row) throw new Error('Failed to insert appeal')
      return rowToAppeal(row)
    },

    getOfficerQueue: async (officerId) => {
      const rows = await fastify.db
        .select({ appeal: appeals, applicantPhone: applicants.phone, report: reports })
        .from(appeals)
        .innerJoin(applicants, eq(appeals.applicantId, applicants.id))
        .leftJoin(reports, eq(appeals.reportId, reports.id))
        .where(eq(appeals.assignedOfficerId, officerId))
        .orderBy(desc(appeals.createdAt))

      return rows.map((r) => ({
        ...rowToAppeal(r.appeal),
        applicantPhone: r.applicantPhone,
        report: r.report
          ? {
              score: r.report.score,
              verdictKey: r.report.verdictKey,
              matchedSchemeId: r.report.matchedSchemeId,
              inputs: r.report.inputs as Record<string, unknown>,
            }
          : null,
      }))
    },

    getAppealById: async (appealId) => {
      const [row] = await fastify.db.select().from(appeals).where(eq(appeals.id, appealId)).limit(1)
      return row ? rowToAppeal(row) : null
    },

    updateAppeal: async (appealId, body) => {
      const [row] = await fastify.db
        .update(appeals)
        .set({ status: body.status, resolutionNote: body.resolutionNote ?? null, updatedAt: new Date() })
        .where(eq(appeals.id, appealId))
        .returning()
      if (!row) throw new Error('Failed to update appeal')
      return rowToAppeal(row)
    },
  }

  fastify.post<{ Body: FlagRequestBody }>('/flag', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { sourceTable, sourceRowId, reason } = request.body ?? {}
    if (!sourceTable || !sourceRowId || !reason) {
      return reply.status(400).send({ error: { message: 'sourceTable, sourceRowId and reason are required', code: 'BAD_REQUEST' } })
    }
    const flag = await createFlag(deps, request.user.sub, { sourceTable, sourceRowId, reason })
    return reply.status(201).send({ id: flag.id })
  })

  fastify.post<{ Body: AppealRequestBody }>('/appeal', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource } = request.body ?? {}
    if (!inputs || typeof score !== 'number' || !verdictKey || !matchedSchemeId) {
      return reply.status(400).send({ error: { message: 'inputs, score, verdictKey and matchedSchemeId are required', code: 'BAD_REQUEST' } })
    }
    const appeal = await createAppeal(deps, request.user.sub, { inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource })
    return reply.status(201).send(appeal)
  })

  // Best-effort report persistence for the peer-benchmark feature — see
  // service.ts's saveReport. Same body shape as /appeal, no appeal created.
  fastify.post<{ Body: AppealRequestBody }>('/report', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource } = request.body ?? {}
    if (!inputs || typeof score !== 'number' || !verdictKey || !matchedSchemeId) {
      return reply.status(400).send({ error: { message: 'inputs, score, verdictKey and matchedSchemeId are required', code: 'BAD_REQUEST' } })
    }
    const report = await saveReport(deps, request.user.sub, { inputs, score, verdictKey, matchedSchemeId, emiSchedule, marginCapitalSource })
    return reply.status(201).send(report)
  })

  fastify.get('/queue', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const queue = await getOfficerQueueService(deps, request.user.role, request.user.sub)
    return reply.status(200).send(queue)
  })

  fastify.patch<{ Params: { id: string }; Body: UpdateAppealBody }>(
    '/appeals/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { status, resolutionNote } = request.body ?? {}
      if (!status || !VALID_STATUSES.includes(status)) {
        return reply.status(400).send({ error: { message: `status must be one of ${VALID_STATUSES.join(', ')}`, code: 'BAD_REQUEST' } })
      }
      const appeal = await updateAppealStatus(deps, request.user.role, request.user.sub, request.params.id, { status, resolutionNote })
      return reply.status(200).send(appeal)
    }
  )
}

export default feedbackRoutes
