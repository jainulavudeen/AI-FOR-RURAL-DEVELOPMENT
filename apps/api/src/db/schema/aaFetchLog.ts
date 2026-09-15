import { sql } from 'drizzle-orm'
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'

// Append-only audit trail for every Account Aggregator fetch attempt —
// "log what was fetched and why." One row per attempt, success or
// failure, never overwritten.
export const aaFetchLog = pgTable(
  'aa_fetch_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    consentId: text('consent_id').notNull(),
    purpose: text('purpose').notNull(),
    status: text('status').notNull(),
    recordCount: integer('record_count'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('aa_fetch_log_applicant_id_idx').on(table.applicantId),
    check('aa_fetch_log_status_check', sql`${table.status} in ('success', 'failure')`),
  ]
)
