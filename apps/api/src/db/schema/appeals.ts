import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'
import { reports } from './reports.js'

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
    // CPGRAMS escalation state (see modules/feedback/escalation.ts). These
    // three are only ever set together, by escalateAppeal — never by the
    // generic officer status-update endpoint (escalation is a distinct
    // action with its own audit trail, not just another status value).
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    escalationReason: text('escalation_reason'),
    cpgramsReferenceId: text('cpgrams_reference_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('appeals_applicant_id_idx').on(table.applicantId),
    index('appeals_officer_id_idx').on(table.assignedOfficerId),
    check(
      'appeals_status_check',
      sql`${table.status} in ('pending', 'assigned', 'in_review', 'resolved', 'rejected', 'escalated')`
    ),
    check(
      'appeals_escalation_reason_check',
      sql`${table.escalationReason} is null or ${table.escalationReason} in ('sla_breach', 'applicant_requested')`
    ),
  ]
)
