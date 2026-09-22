export interface ParsedBankTransaction {
  occurredAt: Date
  description: string
  amount: number
  direction: 'credit' | 'debit'
}

export interface ParseResult {
  transactions: ParsedBankTransaction[]
  // Lines that looked transaction-shaped (had a recognizable date) but
  // couldn't be confidently classified as debit or credit — surfaced back
  // to the applicant rather than silently dropped or guessed wrong.
  warnings: string[]
}

export interface UploadBankStatementResult {
  status: 'success' | 'partial'
  transactionsExtracted: number
  warnings: string[]
}
