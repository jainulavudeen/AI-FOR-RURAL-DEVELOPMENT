import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'

// A frozen, point-in-time snapshot of an applicant's financial position —
// generated on demand, then immutable, the same "freeze at generation
// time" posture `reports.inputs`/`emiSchedule` already use for the same
// reason (CLAUDE.md's reproducibility principle): a printed dossier a bank
// officer is holding must keep saying what it said when it was issued,
// even if the applicant's live ledger/credit score moves the next day.
// Append-only — no update route exists, and none should.
export const bankDossiers = pgTable(
  'bank_dossiers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    // Set when the dossier was generated "for" one specific matched scheme
    // (the /schemes page's "Print Bank Dossier for this scheme" button);
    // null for a general-purpose dossier.
    schemeId: text('scheme_id'),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('bank_dossiers_applicant_id_idx').on(table.applicantId)]
)
