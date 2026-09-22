import type { LedgerPaymentMode, LedgerTransactionType } from '@setu/core'

// applicantId is deliberately absent — always request.user.sub, never
// client-supplied (same reasoning as siteCapture/types.ts).
export interface CreateTransactionBody {
  type: LedgerTransactionType
  amount: number
  paymentMode?: LedgerPaymentMode
  customerName?: string | null
  note?: string | null
  // ISO datetime; defaults to "now" server-side when absent. Lets an
  // offline-queued entry (written well after it happened, once the device
  // regains signal) still record the real moment of the sale.
  occurredAt?: string
}

export interface LedgerTransactionRecord {
  id: string
  type: LedgerTransactionType
  amount: number
  paymentMode: LedgerPaymentMode
  customerName: string | null
  note: string | null
  occurredAt: string
  createdAt: string
}
