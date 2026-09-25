import { sql } from 'drizzle-orm'
import { boolean, check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// One account, up to two sign-in methods: a verified phone (OTP) and/or a
// verified Google identity (`google_sub`, the stable Google account id —
// never the email, which a Google user can change). At least one must be
// set. A Google sign-in only ever matches an existing row by google_sub,
// or by a pending admin invite on a Google-verified email
// (`invited_email`) — never by auto-merging on email alone, so signing in
// with a Gmail can't silently hijack or duplicate a phone account. Linking
// a second method happens only from an already-signed-in session
// (modules/auth: /link/google, /link/phone).
//
// `role` is authoritative here and nowhere else — plugins/auth.ts re-reads
// it from this row on every authenticated request, so the JWT's copy is a
// hint, never trusted. Self-registration always yields 'applicant'.
// 'officer' is only ever set by an admin invite (modules/admin) and
// 'admin' only by the ADMIN_BOOTSTRAP_* env seed (db/bootstrapAdmin.ts).
// `active=false` (an admin deactivating an officer) blocks sign-in and
// every authenticated request immediately.
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
    phone: text('phone').unique(),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    googleSub: text('google_sub').unique(),
    email: text('email'),
    // Set by an admin invite (lower-cased); consumed and cleared on the
    // invitee's first Google sign-in with this exact verified email.
    invitedEmail: text('invited_email').unique(),
    displayName: text('display_name'),
    // Officers only — set by the admin who invited them, then frozen onto
    // each approval they record (application_decisions), never typed in
    // freehand at approval time.
    designation: text('designation'),
    role: text('role').notNull().default('applicant'),
    active: boolean('active').notNull().default(true),
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
    check(
      'applicants_identity_check',
      sql`${table.phone} is not null or ${table.googleSub} is not null or ${table.invitedEmail} is not null`
    ),
    check('applicants_role_check', sql`${table.role} in ('applicant', 'officer', 'admin')`),
    check(
      'applicants_aa_consent_status_check',
      sql`${table.aaConsentStatus} is null or ${table.aaConsentStatus} in ('not_requested', 'pending', 'active', 'rejected', 'revoked', 'expired')`
    ),
  ]
)
