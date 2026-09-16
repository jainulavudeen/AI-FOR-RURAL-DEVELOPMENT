import type { FastifyPluginAsync } from 'fastify'
import { processUssdTurn } from './service'

// One HTTP endpoint a real USSD aggregator's webhook would call per screen
// turn. This is deliberately a generic {sessionId, phoneNumber, input} JSON
// contract, not any specific vendor's wire format (e.g. Africa's Talking's
// accumulated "1*2*3" `text` field + CON/END-prefixed plain-text response,
// or an Indian telecom's own USSD gateway convention) — THIS is the part
// that "genuinely needs a government/telecom integration we do not have":
// there's no USSD short-code, aggregator account, or telecom partnership
// behind this route. A real deployment would add one thin adapter here
// that translates a specific gateway's request/response shape to/from this
// same {sessionId, input} -> {screen, continueSession} contract — the
// session state machine (sessionMachine.ts) and its tests would not change.
//
// Unauthenticated by construction: a USSD session is identified only by
// phoneNumber + sessionId from the gateway, there is no login concept on a
// feature phone. This pass also doesn't create any applicants/reports row
// from a USSD session — see HANDOVER.md; wiring phone-number identity from
// USSD into the same auth/report model as the web app is real, separate
// work, not done here.
const ussdRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { sessionId?: string; phoneNumber?: string; input?: string } }>('/session', async (request, reply) => {
    const { sessionId, input } = request.body ?? {}
    if (!sessionId) {
      return reply.status(400).send({ error: { message: 'sessionId is required', code: 'BAD_REQUEST' } })
    }
    const result = await processUssdTurn(fastify.redis, sessionId, input ?? '')
    return reply.status(200).send(result)
  })
}

export default ussdRoutes
