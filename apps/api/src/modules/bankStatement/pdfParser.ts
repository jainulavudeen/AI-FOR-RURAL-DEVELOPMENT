import type { ParsedBankTransaction, ParseResult } from './types.js'

// Best-effort bank-statement text parser — deliberately NOT a general
// solution. Real bank-statement PDFs vary wildly in layout across banks
// (column order, date format, whether the balance column also carries a
// DR/CR tag, multi-line entries...); robustly handling all of them is a
// serious document-parsing problem real fintechs pay third-party services
// for. This handles two common, recognizable shapes and is honest when it
// can't confidently classify either way — a transaction-shaped line
// (recognizable date) that fails both becomes a warning, never a guess:
//
//  1. A rupee amount sitting immediately next to a DR/CR or
//     DEBIT/CREDIT/WITHDRAWAL/DEPOSIT marker (e.g. "500.00 DR").
//  2. A separate Debit/Credit-column layout with NO marker at all (e.g.
//     SBI's own passbook-style export: "...Description... 100.00
//     20350.75" — amount then running balance, direction unlabeled). This
//     is classified from the running balance itself: comparing this
//     line's trailing balance to the previous transaction-line's balance
//     tells you debit vs credit deterministically — it is arithmetic, not
//     a guess — and is only trusted when that delta's magnitude actually
//     matches the printed amount, so a coincidental extra number never
//     gets misread as a transaction.
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

// Any plain rupee-decimal number, no marker required — used by the
// balance-delta fallback below to find every candidate amount/balance on
// a line, in left-to-right order.
const PLAIN_AMOUNT_RE = /(?:₹|rs\.?|inr)?\s?([\d,]+\.\d{2})/gi

const DEBIT_KEYWORDS = new Set(['dr', 'debit', 'withdrawal'])
const MAX_TRANSACTIONS = 2000
const MIN_YEAR = 2015
const BALANCE_EPSILON = 0.01

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

interface AmountMatch {
  value: number
  index: number
}

function collectPlainAmounts(line: string): AmountMatch[] {
  const out: AmountMatch[] = []
  let m: RegExpExecArray | null
  PLAIN_AMOUNT_RE.lastIndex = 0
  while ((m = PLAIN_AMOUNT_RE.exec(line))) {
    const raw = m[1]
    if (!raw) continue
    out.push({ value: Number(raw.replace(/,/g, '')), index: m.index })
  }
  return out
}

export function parseBankStatementText(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const transactions: ParsedBankTransaction[] = []
  const warnings: string[] = []

  // Tracks the running balance printed on the last transaction-shaped
  // line seen, however it was (or wasn't) classified — the unmarked
  // Debit/Credit-column fallback needs this to turn "balance went down"
  // into "debit", which only works if the chain of balances stays
  // unbroken across lines, classified or not.
  let previousBalance: number | null = null

  for (const rawLine of lines) {
    if (transactions.length >= MAX_TRANSACTIONS) break

    const line = rawLine.trim()
    if (!line) continue

    const { date, matchLength } = tryParseDate(line)
    if (!date) continue // not a transaction-shaped line at all — normal for headers/footers, no warning

    const amounts = collectPlainAmounts(line)
    const currentBalance = amounts.length > 0 ? (amounts[amounts.length - 1]?.value ?? null) : null

    const match = AMOUNT_DIRECTION_RE.exec(line)
    if (match) {
      const amountText = match[1] ?? match[4]
      const keyword = (match[2] ?? match[3])?.toLowerCase()
      const amount = Number(amountText?.replace(/,/g, ''))

      if (amountText && keyword && Number.isFinite(amount) && amount > 0) {
        const direction: 'debit' | 'credit' = DEBIT_KEYWORDS.has(keyword) ? 'debit' : 'credit'
        const description = extractDescription(line, matchLength, match.index) || 'Bank transaction'
        transactions.push({ occurredAt: date, description, amount, direction })
        previousBalance = currentBalance ?? previousBalance
        continue
      }
    }

    // Fallback: no DR/CR-style marker anywhere on the line — try a
    // separate Debit/Credit-column layout instead, where the last number
    // is a running balance and exactly one earlier number is the
    // transaction amount. Direction comes from comparing this balance to
    // the previous line's (arithmetic, not a guess); it's only trusted
    // when the delta's size actually matches the printed amount, so an
    // unrelated pair of numbers can't coincidentally get read as a
    // transaction.
    const nonBalanceAmounts = amounts.slice(0, -1)
    const candidate = nonBalanceAmounts.length === 1 ? nonBalanceAmounts[0] : undefined
    if (candidate && currentBalance != null && previousBalance != null) {
      const delta = currentBalance - previousBalance
      if (
        candidate.value > 0 &&
        Math.abs(delta) > BALANCE_EPSILON &&
        Math.abs(Math.abs(delta) - candidate.value) < BALANCE_EPSILON
      ) {
        const direction: 'debit' | 'credit' = delta < 0 ? 'debit' : 'credit'
        const description = extractDescription(line, matchLength, candidate.index) || 'Bank transaction'
        transactions.push({ occurredAt: date, description, amount: candidate.value, direction })
        previousBalance = currentBalance
        continue
      }
    }

    warnings.push(`Line looked like a transaction but no amount could be classified: "${line.slice(0, 80)}"`)
    previousBalance = currentBalance ?? previousBalance
  }

  return { transactions, warnings }
}
