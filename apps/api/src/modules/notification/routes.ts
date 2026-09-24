import { eq, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { applicants, reports, schemeRules } from '../../db/schema/index.js'
import { createPushProvider } from './pushAdapter.js'
import { NotFoundError, notifySchemeChange, sendNotification, type NotificationDeps } from './service.js'
import { createSmsNotificationProvider } from './smsAdapter.js'
import type { NotificationChannel, SendRequestBody } from './types.js'
import { createWhatsappProvider } from './whatsappAdapter.js'

// Gated — see CLAUDE.md / apps/api/src/plugins/auth.ts: auth gates saving,
// appealing, and notifications, never the deterministic calculator.
const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: NotificationDeps = {
    providers: {
      sms: createSmsNotificationProvider(),
      whatsapp: createWhatsappProvider(),
      push: createPushProvider(),
    },
    getApplicantPhone: async (applicantId) => {
      const [row] = await fastify.db.select({ phone: applicants.phone }).from(applicants).where(eq(applicants.id, applicantId)).limit(1)
      return row?.phone ?? null
    },
    // Distinct applicants whose most recent saved report (see feedback's
    // saveReport/createAppeal — both write to `reports`) matched this
    // scheme. "Most recent" matters: an applicant could have an older
    // report matched to a scheme they've since moved off of.
    getApplicantIdsMatchedToScheme: async (schemeId) => {
      const rows = await fastify.db.execute(sql`
        select distinct on (${reports.applicantId}) ${reports.applicantId} as applicant_id
        from ${reports}
        where ${reports.matchedSchemeId} = ${schemeId}
        order by ${reports.applicantId}, ${reports.createdAt} desc
      `)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (rows as any[]).map((r) => r.applicant_id as string)
    },
  }

  fastify.post<{ Body: SendRequestBody }>('/send', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { applicantId, channel, message } = request.body ?? {}
    if (!applicantId || !channel || !message) {
      return reply.status(400).send({ error: { message: 'applicantId, channel and message are required', code: 'BAD_REQUEST' } })
    }
    try {
      const result = await sendNotification(deps, applicantId, channel, message)
      return reply.status(200).send(result)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: { message: err.message, code: err.code } })
      }
      throw err
    }
  })

  // Officer-triggered — see service.ts's notifySchemeChange and
  // schemeChangeDiff.ts for why this only sends on a material (rate/cap)
  // change. Not wired to any live scheme_rules-mutation route: schemeRouter
  // is still a 501 stub (CLAUDE.md's known, flagged gap), so nothing in
  // this app actually inserts a new scheme_rules version today outside
  // db/seed.ts. This endpoint is real and tested regardless — it's the
  // trigger *point* that's missing, not the logic.
  fastify.post<{ Body: { oldRuleId?: string; newRuleId?: string; channel?: NotificationChannel } }>(
    '/scheme-change',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'officer') {
        return reply.status(403).send({ error: { message: 'Officer role required', code: 'FORBIDDEN' } })
      }
      const { oldRuleId, newRuleId, channel } = request.body ?? {}
      if (!oldRuleId || !newRuleId) {
        return reply.status(400).send({ error: { message: 'oldRuleId and newRuleId are required', code: 'BAD_REQUEST' } })
      }

      const [oldRow] = await fastify.db.select().from(schemeRules).where(eq(schemeRules.id, oldRuleId)).limit(1)
      const [newRow] = await fastify.db.select().from(schemeRules).where(eq(schemeRules.id, newRuleId)).limit(1)
      if (!oldRow || !newRow) {
        return reply.status(404).send({ error: { message: 'One or both scheme_rules rows were not found', code: 'NOT_FOUND' } })
      }

      const result = await notifySchemeChange(
        deps,
        { schemeId: oldRow.schemeId, version: oldRow.version, interestRate: Number(oldRow.interestRate), loanCap: Number(oldRow.loanCap) },
        { schemeId: newRow.schemeId, version: newRow.version, interestRate: Number(newRow.interestRate), loanCap: Number(newRow.loanCap) },
        channel ?? 'sms'
      )
      return reply.status(200).send(result)
    }
  )
}

export default notificationRoutes
