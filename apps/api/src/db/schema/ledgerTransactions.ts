import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'

// Bahi-Khata — the daily cash-flow ledger a micro-entrepreneur logs sales,
// stock expenses and customer credit (udhaar) into. Append-only, like
// `reports`/`siteCaptures`/`aaFetchLog`: a correction is a new offsetting
// entry, never an edit or delete of a past one, so the ledger stays an
// honest record of what was actually logged and when — the same posture
// `reports` takes for the same reason (CLAUDE.md's reproducibility
// principle), even though nothing here is scheme-rules-versioned.
//
// `amount` is always a positive numeric() value regardless of `type` — the
// sign/direction lives in `type`, not in the stored number, so summing
// "all sales" or "all udhaar given" never requires guessing a convention.
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    type: text('type').notNull(),
    amount: numeric('amount').notNull(),
    paymentMode: text('payment_mode').notNull().default('cash'),
    customerName: text('customer_name'),
    note: text('note'),
    // 'self_reported' (Log Sale) vs 'bank_statement' (extracted from an
    // uploaded bank-statement PDF — see the bankStatement module). A real,
    // verifiable-provenance signal distinct from paymentMode.
    source: text('source').notNull().default('self_reported'),
    // When the transaction actually happened, as reported by the
    // applicant — distinct from createdAt (when the row was written),
    // since an offline-queued entry can be written well after it happened.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ledger_transactions_applicant_id_idx').on(table.applicantId),
    check('ledger_transactions_type_check', sql`${table.type} in ('sale', 'expense', 'udhaar_given', 'udhaar_repaid')`),
    check('ledger_transactions_payment_mode_check', sql`${table.paymentMode} in ('cash', 'upi')`),
    check('ledger_transactions_amount_positive_check', sql`${table.amount} > 0`),
    check('ledger_transactions_source_check', sql`${table.source} in ('self_reported', 'bank_statement')`),
  ]
)
