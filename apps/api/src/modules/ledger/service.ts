import { summarizeLedger, type LedgerSummary, type LedgerTransaction } from '@setu/core'
import type { CreateTransactionBody, LedgerTransactionRecord } from './types.js'

const VALID_TYPES = ['sale', 'expense', 'udhaar_given', 'udhaar_repaid']
const VALID_PAYMENT_MODES = ['cash', 'upi']

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// No ownership-mismatch branch exists here (unlike accountAggregator's
// consent-by-id lookups, or siteCapture's report-attachment check) — every
// ledger route only ever reads/writes the caller's own applicantId
// (request.user.sub), never a caller-supplied id, so there is no id to
// mismatch against in the first place. See CLAUDE.md's auth pattern note.
export interface LedgerDeps {
  insertTransaction: (input: {
    applicantId: string
    type: string
    amount: number
    paymentMode: string
    customerName: string | null
    note: string | null
    occurredAt: Date
  }) => Promise<LedgerTransactionRecord>
  getTransactionsByApplicantId: (applicantId: string) => Promise<LedgerTransactionRecord[]>
}

function validate(body: CreateTransactionBody): void {
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    throw new ValidationError(`type must be one of ${VALID_TYPES.join(', ')}`)
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    throw new ValidationError('amount must be a positive number')
  }
  if (body.paymentMode != null && !VALID_PAYMENT_MODES.includes(body.paymentMode)) {
    throw new ValidationError(`paymentMode must be one of ${VALID_PAYMENT_MODES.join(', ')}`)
  }
  if (body.occurredAt != null && Number.isNaN(new Date(body.occurredAt).getTime())) {
    throw new ValidationError('occurredAt must be a valid date')
  }
}

export async function recordTransaction(
  deps: LedgerDeps,
  applicantId: string,
  body: CreateTransactionBody
): Promise<LedgerTransactionRecord> {
  validate(body)
  return deps.insertTransaction({
    applicantId,
    type: body.type,
    amount: body.amount,
    paymentMode: body.paymentMode ?? 'cash',
    customerName: body.customerName ?? null,
    note: body.note ?? null,
    occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
  })
}

export async function listTransactions(deps: LedgerDeps, applicantId: string): Promise<LedgerTransactionRecord[]> {
  return deps.getTransactionsByApplicantId(applicantId)
}

// Recomputed from the raw rows on every call, deliberately never cached or
// stored — see the Setu V2 plan's design decision: a credit/ledger summary
// is purely a function of the applicant's own data, which changes by
// design every time they log something, so there is no "version" of it to
// pin the way scheme_rules pins a report. Same summarizeLedger() apps/web
// calls client-side against its own cached transaction list — one
// implementation, never forked (CLAUDE.md boundary rule 1).
export async function getLedgerSummary(deps: LedgerDeps, applicantId: string, asOfDate: Date = new Date()): Promise<LedgerSummary> {
  const rows = await deps.getTransactionsByApplicantId(applicantId)
  const transactions: LedgerTransaction[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    paymentMode: row.paymentMode,
    occurredAt: row.occurredAt,
    customerName: row.customerName,
    source: row.source,
  }))
  return summarizeLedger(transactions, asOfDate)
}
