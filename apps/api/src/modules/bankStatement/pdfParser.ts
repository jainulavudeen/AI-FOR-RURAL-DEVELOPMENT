import type { ParsedBankTransaction, ParseResult } from './types'

// Best-effort bank-statement text parser — deliberately NOT a general
// solution. Real bank-statement PDFs vary wildly in layout across banks
// (column order, date format, whether the balance column also carries a
// DR/CR tag, multi-line entries...); robustly handling all of them is a
// serious document-parsing problem real fintechs pay third-party services
// for. This handles one common, recognizable shape — a line starting with
// a date, containing a rupee amount immediately next to a DR/CR or
// DEBIT/CREDIT/WITHDRAWAL/DEPOSIT marker — and is honest when it can't:
// a transaction-shaped line (recognizable date) with no confidently-
// classifiable amount becomes a warning, never a guess.
//
// This is why the "supplement, never replace" design decision (see
// service.ts) matters: a partial or imperfect extraction only adds to the
// self-reported ledger, it never silently overwrites it.

const NUMERIC_DATE_RE = /^\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/
const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}
const TEXT_DATE_RE = /^\s*(\d{1,2})\s+([A-Za-z]{3,9})[,.]?\s+(\d{2,4})\b/

// Matches either "1,234.56 DR" or "DR 1,234.56" (and CR/DEBIT/CREDIT/
// WITHDRAWAL/DEPOSIT) — only the first match on a line is used as the
// transaction amount, since a trailing running-balance column sometimes
// also carries its own DR/CR tag in some formats; taking the first one is
// the safer assumption for where the actual transaction amount sits.
const AMOUNT_DIRECTION_RE =
  /(?:₹|rs\.?|inr)?\s?([\d,]+\.\d{2})\s*\(?(dr|cr|debit|credit|withdrawal|deposit)\)?|\b(dr|cr|debit|credit|withdrawal|deposit)\)?\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s?([\d,]+\.\d{2})/i

const DEBIT_KEYWORDS = new Set(['dr', 'debit', 'withdrawal'])
const MAX_TRANSACTIONS = 2000
const MIN_YEAR = 2015

function normalizeYear(rawYear: number): number {
  if (rawYear >= 100) return rawYear
  return rawYear + 2000
}

function tryParseDate(line: string): { date: Date | null; matchLength: number } {
  const numeric = line.match(NUMERIC_DATE_RE)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const year = normalizeYear(Number(numeric[3]))
    const date = new Date(Date.UTC(year, month - 1, day))
    const valid =
      year >= MIN_YEAR && year <= new Date().getUTCFullYear() + 1 && month >= 1 && month <= 12 && day >= 1 && day <= 31
    return { date: valid ? date : null, matchLength: numeric[0].length }
  }

  const textual = line.match(TEXT_DATE_RE)
  if (textual) {
    const day = Number(textual[1])
    const monthName = (textual[2] ?? '').slice(0, 3).toLowerCase()
    const month = MONTH_NAMES[monthName]
    const year = normalizeYear(Number(textual[3]))
    if (month != null) {
      const date = new Date(Date.UTC(year, month, day))
      const valid = year >= MIN_YEAR && year <= new Date().getUTCFullYear() + 1 && day >= 1 && day <= 31
      return { date: valid ? date : null, matchLength: textual[0].length }
    }
  }

  return { date: null, matchLength: 0 }
}

function extractDescription(line: string, afterDateIndex: number, amountMatchIndex: number): string {
  const end = amountMatchIndex > afterDateIndex ? amountMatchIndex : line.length
  return line
    .slice(afterDateIndex, end)
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseBankStatementText(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const transactions: ParsedBankTransaction[] = []
  const warnings: string[] = []

  for (const rawLine of lines) {
    if (transactions.length >= MAX_TRANSACTIONS) break

    const line = rawLine.trim()
    if (!line) continue

    const { date, matchLength } = tryParseDate(line)
    if (!date) continue // not a transaction-shaped line at all — normal for headers/footers, no warning

    const match = AMOUNT_DIRECTION_RE.exec(line)
    if (!match) {
      warnings.push(`Line looked like a transaction but no amount could be classified: "${line.slice(0, 80)}"`)
      continue
    }

    const amountText = match[1] ?? match[4]
    const keyword = (match[2] ?? match[3])?.toLowerCase()
    const amount = Number(amountText?.replace(/,/g, ''))

    if (!amountText || !keyword || !Number.isFinite(amount) || amount <= 0) {
      warnings.push(`Line looked like a transaction but the amount could not be read: "${line.slice(0, 80)}"`)
      continue
    }

    const direction: 'debit' | 'credit' = DEBIT_KEYWORDS.has(keyword) ? 'debit' : 'credit'
    const description = extractDescription(line, matchLength, match.index) || 'Bank transaction'

    transactions.push({ occurredAt: date, description, amount, direction })
  }

  return { transactions, warnings }
}
