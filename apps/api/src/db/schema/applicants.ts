import { sql } from 'drizzle-orm'
import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Phone-verified identity. No email column — rural first-time applicants
// often share a family phone and rarely check email (see CLAUDE.md target
// user). `role` is a minimal forward-looking field so appeals.assigned_officer_id
// has something to point at — full auth/RBAC is a later prompt, not this one.
//
// aa_consent_* is Account Aggregator opt-in state — separate from
// consent_data_use/consent_marketing above (a different regulatory basis:
// RBI-AA-framework consented financial data, not generic app consent).
// Always starts null/not_requested; self-reported margin capital is the
// default with zero precondition, per CLAUDE.md.
export const applicants = pgTable(
  'applicants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    phone: text('phone').notNull().unique(),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    role: text('role').notNull().default('applicant'),
    consentDataUse: boolean('consent_data_use').notNull().default(false),
    consentMarketing: boolean('consent_marketing').notNull().default(false),
    consentRecordedAt: timestamp('consent_recorded_at', { withTimezone: true }),
    // The consent id itself, not just its status — needed so a later
    // fetch can verify the caller owns the consent they're citing, not
    // just that *some* consent is active.
    aaConsentId: text('aa_consent_id'),
    aaConsentStatus: text('aa_consent_status'),
    aaConsentScope: jsonb('aa_consent_scope'),
    aaConsentAt: timestamp('aa_consent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('applicants_role_check', sql`${table.role} in ('applicant', 'officer')`),
    check(
      'applicants_aa_consent_status_check',
      sql`${table.aaConsentStatus} is null or ${table.aaConsentStatus} in ('not_requested', 'pending', 'active', 'rejected', 'revoked', 'expired')`
    ),
  ]
)
