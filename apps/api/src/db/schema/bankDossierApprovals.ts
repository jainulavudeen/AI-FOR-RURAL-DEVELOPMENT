import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'
import { bankDossiers } from './bankDossiers'

// "Verified Approval" (never "digitally signed" — no government DSC exists
// here, see CLAUDE.md item 7). Append-only, same posture as bank_dossiers
// itself: re-approving (or approving again after an edit) INSERTs a new
// row, it never UPDATEs an existing one — the full approval history stays
// intact and any previously-printed hash keeps verifying against the
// record it was actually issued from, even after a later approval
// supersedes it as "current". officerName/officerDesignation are
// self-reported at approval time and frozen here (applicants has no
// name/designation column — this is phone-OTP-only identity, see
// applicants.ts) rather than editable profile fields, consistent with
// bank_dossiers.snapshot's own "frozen at the moment it was generated"
// approach.
export const bankDossierApprovals = pgTable(
  'bank_dossier_approvals',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    dossierId: uuid('dossier_id')
      .notNull()
      .references(() => bankDossiers.id),
    officerId: uuid('officer_id')
      .notNull()
      .references(() => applicants.id),
    officerName: text('officer_name').notNull(),
    officerDesignation: text('officer_designation').notNull(),
    // sha256(dossierId + officerId + approvedAt.toISOString() + server
    // secret) — see lib/approvalSignature.ts. Printed on the document;
    // GET /bank-dossier/verify/:hash lets a bank re-derive and confirm it
    // without needing DB access of their own.
    signatureHash: text('signature_hash').notNull().unique(),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bank_dossier_approvals_dossier_id_idx').on(table.dossierId),
    index('bank_dossier_approvals_signature_hash_idx').on(table.signatureHash),
  ]
)
