import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'
import { bankDossiers } from './bankDossiers.js'
import { blocks } from './blocks.js'
import { districts } from './districts.js'
import { reports } from './reports.js'

// The one object that carries an applicant from "saved report" to
// "approved, bank-verifiable dossier" (modules/applications/). Lifecycle:
//   draft → submitted → under_review → approved | rejected | more_info
// with rejected/more_info → submitted again on resubmit, and approved →
// draft again if the applicant revises it (the old approval stays on
// record, marked superseded — see application_decisions).
//
// `report_id` / `dossier_id` always point at the CURRENT version under
// review; both referenced rows are themselves immutable, so a revision
// swaps the pointer to new rows rather than editing old ones. The
// dossier is frozen at submit time, so the officer approves exactly the
// document the bank will later hold.
//
// `district_id`/`block_id` are resolved server-side from the report's
// (state, district, block) names at submit time — never taken from the
// client as ids. `assigned_officer_id` null + status submitted = the
// admin's unassigned queue (no officer covers that block).
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    dossierId: uuid('dossier_id').references(() => bankDossiers.id),
    districtId: uuid('district_id').references(() => districts.id),
    blockId: uuid('block_id').references(() => blocks.id),
    status: text('status').notNull().default('draft'),
    assignedOfficerId: uuid('assigned_officer_id').references(() => applicants.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('applications_applicant_idx').on(table.applicantId),
    index('applications_officer_idx').on(table.assignedOfficerId),
    index('applications_status_idx').on(table.status),
    check(
      'applications_status_check',
      sql`${table.status} in ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'more_info')`
    ),
  ]
)

// Append-only status history — what the applicant's timeline renders.
// Every row is also mirrored into audit_log (the admin's cross-cutting
// view); this table exists separately because the applicant may read
// their own application's history, but never the audit log.
export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    actorId: uuid('actor_id').references(() => applicants.id),
    actorRole: text('actor_role').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    note: text('note'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('application_events_application_idx').on(table.applicationId, table.createdAt)]
)

// An officer's decision, recorded permanently — never updated or deleted.
// A later decision on the same application (after a resubmission or a
// post-approval revision) is a new row; the latest row is "current".
//
// For an approval, `signature_hash` = sha256(applicationId + officerId +
// decidedAt ISO + APPROVAL_SIGNING_SECRET) (lib/approvalSignature.ts),
// printed on the dossier's "Verified Approval" block and checked by the
// public GET /applications/verify/:hash. Not a digital signature — no
// government DSC exists here, and the UI must never call it one.
// officer_name/officer_designation are copied from the officer's
// admin-managed profile at decision time and frozen here.
export const applicationDecisions = pgTable(
  'application_decisions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id),
    dossierId: uuid('dossier_id').references(() => bankDossiers.id),
    officerId: uuid('officer_id')
      .notNull()
      .references(() => applicants.id),
    officerName: text('officer_name').notNull(),
    officerDesignation: text('officer_designation').notNull(),
    decision: text('decision').notNull(),
    note: text('note'),
    signatureHash: text('signature_hash').unique(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('application_decisions_application_idx').on(table.applicationId, table.decidedAt),
    check('application_decisions_decision_check', sql`${table.decision} in ('approved', 'rejected', 'more_info')`),
    check(
      'application_decisions_hash_check',
      sql`(${table.decision} = 'approved') = (${table.signatureHash} is not null)`
    ),
  ]
)
