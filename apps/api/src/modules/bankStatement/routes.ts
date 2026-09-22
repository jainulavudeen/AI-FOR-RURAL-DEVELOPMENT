import multipart from '@fastify/multipart'
import { eq } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { PDFParse } from 'pdf-parse'
import { bankStatementUploads, ledgerTransactions } from '../../db/schema'
import { uploadBankStatement, MAX_FILE_SIZE_BYTES, type BankStatementDeps } from './service'
import type { ParsedBankTransaction } from './types'

// Auth-gated — writes into the caller's own ledger, same "saving" class as
// the ledger module itself. Registers @fastify/multipart locally, scoped
// to this plugin's own encapsulation context — no other route in the app
// needs multipart handling, so it doesn't need to be global.
const bankStatementRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(multipart, { limits: { fileSize: MAX_FILE_SIZE_BYTES } })

  const deps: BankStatementDeps = {
    extractText: async (buffer) => {
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        return result.text
      } finally {
        await parser.destroy()
      }
    },
    insertTransactions: async (applicantId, transactions: ParsedBankTransaction[]) => {
      if (transactions.length === 0) return 0
      const rows = await fastify.db
        .insert(ledgerTransactions)
        .values(
          transactions.map((t) => ({
            applicantId,
            type: (t.direction === 'credit' ? 'sale' : 'expense') as 'sale' | 'expense',
            amount: String(t.amount),
            // Every bank-statement-derived transaction moved through a
            // bank rail (NEFT/IMPS/UPI/etc.), not cash-in-hand — 'upi' is
            // used here as this schema's closest existing concept of
            // "digital, not cash", not a literal claim every row was a UPI
            // payment specifically.
            paymentMode: 'upi' as const,
            customerName: null,
            note: t.description.slice(0, 500),
            source: 'bank_statement' as const,
            occurredAt: t.occurredAt,
          }))
        )
        .returning({ id: ledgerTransactions.id })
      return rows.length
    },
    logUpload: async (input) => {
      await fastify.db.insert(bankStatementUploads).values({
        applicantId: input.applicantId,
        filename: input.filename,
        status: input.status,
        transactionsExtracted: input.transactionsExtracted,
        warnings: input.warnings,
        errorMessage: input.errorMessage,
      })
    },
  }

  fastify.post('/upload', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: { message: 'file is required', code: 'BAD_REQUEST' } })
    }
    const buffer = await file.toBuffer()
    const result = await uploadBankStatement(deps, request.user.sub, file.filename, buffer)
    return reply.status(200).send(result)
  })

  fastify.get('/uploads', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const rows = await fastify.db
      .select()
      .from(bankStatementUploads)
      .where(eq(bankStatementUploads.applicantId, request.user.sub))
      .orderBy(bankStatementUploads.createdAt)
    return reply.status(200).send(
      rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        status: row.status,
        transactionsExtracted: row.transactionsExtracted,
        warnings: row.warnings ?? [],
        errorMessage: row.errorMessage,
        createdAt: row.createdAt.toISOString(),
      }))
    )
  })
}

export default bankStatementRoutes
