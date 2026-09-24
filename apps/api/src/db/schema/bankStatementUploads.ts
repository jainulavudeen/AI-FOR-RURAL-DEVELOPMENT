import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'

// Append-only audit trail for every bank-statement upload attempt —
// success, partial (some lines couldn't be parsed), or failed — the same
// "log what was attempted and why" posture aa_fetch_log already has for
// Account Aggregator fetches. Never overwritten; a re-upload is a new row.
export const bankStatementUploads = pgTable(
  'bank_statement_uploads',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    filename: text('filename').notNull(),
    status: text('status').notNull(),
    transactionsExtracted: integer('transactions_extracted').notNull().default(0),
    // Human-readable notes on lines the best-effort parser recognized as
    // transaction-shaped but couldn't confidently classify (no clear
    // DR/CR marker) — surfaced back to the applicant, not silently dropped.
    warnings: jsonb('warnings'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bank_statement_uploads_applicant_id_idx').on(table.applicantId),
    check('bank_statement_uploads_status_check', sql`${table.status} in ('success', 'partial', 'failed')`),
  ]
)
