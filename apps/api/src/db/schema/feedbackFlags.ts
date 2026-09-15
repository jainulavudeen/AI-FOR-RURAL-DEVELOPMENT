import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'

// A dispute linked to the specific source dataset + row, not just free text.
// `sourceTable`/`sourceRowId` are a deliberately polymorphic reference —
// a flag can target a scheme_rules row, a districts row, a future grounding
// document — rather than a rigid FK, since the disputed table varies.
export const feedbackFlags = pgTable(
  'feedback_flags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    sourceTable: text('source_table').notNull(),
    sourceRowId: text('source_row_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_flags_source_idx').on(table.sourceTable, table.sourceRowId),
    check(
      'feedback_flags_status_check',
      sql`${table.status} in ('open', 'reviewing', 'resolved', 'dismissed')`
    ),
  ]
)
