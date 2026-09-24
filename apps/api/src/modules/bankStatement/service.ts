import { parseBankStatementText } from './pdfParser.js'
import type { ParsedBankTransaction, UploadBankStatementResult } from './types.js'

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024 // 8 MB — a real statement PDF is typically well under 1 MB

export interface BankStatementDeps {
  extractText: (buffer: Buffer) => Promise<string>
  insertTransactions: (applicantId: string, transactions: ParsedBankTransaction[]) => Promise<number>
  logUpload: (input: {
    applicantId: string
    filename: string
    status: 'success' | 'partial' | 'failed'
    transactionsExtracted: number
    warnings: string[]
    errorMessage: string | null
  }) => Promise<void>
}

function validateFile(filename: string, buffer: Buffer): void {
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new ValidationError('Only PDF bank statements are supported.')
  }
  if (buffer.length === 0) {
    throw new ValidationError('The uploaded file is empty.')
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit.`)
  }
}

// Uploads and parses a bank-statement PDF, inserting every confidently-
// classified transaction into the applicant's OWN ledger, tagged
// source: 'bank_statement' — never replacing self-reported Bahi-Khata
// entries, only supplementing them (this session's explicit design
// decision). Degrades honestly at every stage per CLAUDE.md rule 4: an
// unreadable PDF, or one with zero recognizable transactions, is a clear
// rejected upload with a real error message — never a silent zero-result
// "success".
export async function uploadBankStatement(
  deps: BankStatementDeps,
  applicantId: string,
  filename: string,
  buffer: Buffer
): Promise<UploadBankStatementResult> {
  validateFile(filename, buffer)

  let text: string
  try {
    text = await deps.extractText(buffer)
  } catch (err) {
    await deps.logUpload({
      applicantId,
      filename,
      status: 'failed',
      transactionsExtracted: 0,
      warnings: [],
      errorMessage: 'Could not read this PDF — it may be corrupted, scanned as an image, or password-protected.',
    })
    throw new ValidationError('Could not read this PDF — it may be corrupted, scanned as an image, or password-protected.')
  }

  const { transactions, warnings } = parseBankStatementText(text)

  if (transactions.length === 0) {
    const errorMessage =
      'No recognizable transactions were found in this statement. This parser only handles common tabular layouts with a clear date and a DR/CR or DEBIT/CREDIT marker next to each amount — try a different statement export, or keep logging manually in Bahi-Khata.'
    await deps.logUpload({ applicantId, filename, status: 'failed', transactionsExtracted: 0, warnings, errorMessage })
    throw new ValidationError(errorMessage)
  }

  const insertedCount = await deps.insertTransactions(applicantId, transactions)
  const status: 'success' | 'partial' = warnings.length > 0 ? 'partial' : 'success'
  await deps.logUpload({ applicantId, filename, status, transactionsExtracted: insertedCount, warnings, errorMessage: null })

  return { status, transactionsExtracted: insertedCount, warnings }
}
