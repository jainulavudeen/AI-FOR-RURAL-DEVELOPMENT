import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import type { LedgerPaymentMode, LedgerTransaction, LedgerTransactionSource, LedgerTransactionType } from '@setu/core'
import { ledgerTransactions } from '../../db/schema/index.js'
import { chat, type AdvisorSaathiDeps } from './service.js'
import type { ChatRequestBody, ChatResult } from './types.js'

// Auth-gated (grounding itself in an applicant's own private ledger data —
// squarely a "saving"-adjacent action, unlike grounding/query's public,
// unauthenticated GET). Reads only the caller's own ledger
// (request.user.sub) — no ownership-mismatch branch needed, same posture
// as ledger/creditScore.
const advisorSaathiRoutes: FastifyPluginAsync = async (fastify) => {
  const deps: AdvisorSaathiDeps = {
    db: fastify.db,
    redis: fastify.redis,
    getTransactionsByApplicantId: async (applicantId): Promise<LedgerTransaction[]> => {
      const rows = await fastify.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.applicantId, applicantId))
      return rows.map((row) => ({
        id: row.id,
        type: row.type as LedgerTransactionType,
        amount: Number(row.amount),
        paymentMode: row.paymentMode as LedgerPaymentMode,
        occurredAt: row.occurredAt,
        customerName: row.customerName,
        source: row.source as LedgerTransactionSource,
      }))
    },
  }

  // Server-Sent Events, not a plain JSON response — the whole point of
  // item 3's "streaming, never a spinner that never resolves" ask. Real
  // token-level streaming straight from the model is NOT possible here
  // without breaking CLAUDE.md's non-negotiable boundary rule 2: nothing
  // may reach the user before the full answer has been checked against
  // the numeric validator (grounding/validator.ts), and a partial
  // sentence can't be validated. So `chat()` runs exactly as before
  // (buffered, validated, falls back to the deterministic template on a
  // timeout/rejected answer) and only the resulting, already-safe text is
  // revealed progressively — a genuine streaming UX with the safety
  // boundary fully intact, not raw model tokens.
  fastify.post<{ Body: ChatRequestBody }>('/chat', { preHandler: [fastify.requireRole('applicant')] }, async (request, reply) => {
    const body = request.body ?? ({} as ChatRequestBody)
    if (!body.question?.trim()) {
      return reply.status(400).send({ error: { message: 'question is required', code: 'BAD_REQUEST' } })
    }

    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    let clientClosed = false
    request.raw.on('close', () => {
      clientClosed = true
    })

    const send = (event: string, data: unknown) => {
      if (clientClosed || reply.raw.writableEnded) return
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    // Immediate feedback that the request is in flight — the client can
    // switch from "sending" to "thinking" the instant this arrives,
    // rather than staring at silence for however long chat() takes
    // (bounded by LLM_TIMEOUT_MS + the retrieval timeout, but still not
    // instant).
    send('start', {})

    let result: ChatResult
    try {
      result = await chat(deps, request.user.sub, body)
    } catch (err) {
      send('error', { message: err instanceof Error ? err.message : 'Unknown error' })
      if (!clientClosed) reply.raw.end()
      return
    }

    if (clientClosed) return

    const CHUNK_WORDS = 6
    const words = result.answer.split(' ')
    for (let i = 0; i < words.length; i += CHUNK_WORDS) {
      if (clientClosed) return
      const chunk = words.slice(i, i + CHUNK_WORDS).join(' ') + (i + CHUNK_WORDS < words.length ? ' ' : '')
      send('chunk', { text: chunk })
      // Purely cosmetic pacing for a visible streaming effect — the text
      // is already fully computed and validated above, so this delay is
      // never hiding a real wait.
      await new Promise((resolve) => setTimeout(resolve, 35))
    }

    send('done', {
      narrationSource: result.narrationSource,
      tier: result.tier,
      claims: result.claims,
      numbers: result.numbers,
    })
    reply.raw.end()
  })
}

export default advisorSaathiRoutes
