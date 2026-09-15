import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'
import { reports } from './reports'

// Officers are applicants-table rows distinguished by `role` (see
// applicants.ts) rather than a separate table — matches the phone-only
// identity model. Revisit if a real officer directory shows up later.
export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    reportId: uuid('report_id').references(() => reports.id),
    status: text('status').notNull().default('pending'),
    assignedOfficerId: uuid('assigned_officer_id').references(() => applicants.id),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('appeals_applicant_id_idx').on(table.applicantId),
    index('appeals_officer_id_idx').on(table.assignedOfficerId),
    check(
      'appeals_status_check',
      sql`${table.status} in ('pending', 'assigned', 'in_review', 'resolved', 'rejected')`
    ),
  ]
)
