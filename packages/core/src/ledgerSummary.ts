// Bahi-Khata's aggregation layer — turns a flat list of ledger transactions
// into the totals, month-by-month trend, and udhaar/digital-share figures
// every downstream screen reads (Bahi-Khata itself, Credit Score's pillars,
// the Dashboard's cash-flow snapshot, the Bank Dossier's audit section).
//
// Deterministic, synchronous, no I/O — same boundary as calculator.ts (see
// CLAUDE.md). Imported unforked by both apps/web (offline-first, recomputed
// from a locally cached transaction list) and apps/api (recomputed from the
// same rows read out of Postgres) — there is exactly one implementation of
// "what does this applicant's ledger add up to," never two that could drift.
export type LedgerTransactionType = 'sale' | 'expense' | 'udhaar_given' | 'udhaar_repaid'
export type LedgerPaymentMode = 'cash' | 'upi'

export interface LedgerTransaction {
  id: string
  type: LedgerTransactionType
  amount: number
  paymentMode: LedgerPaymentMode
  occurredAt: string | Date
  customerName?: string | null
}

export interface MonthBucket {
  // 'YYYY-MM', sortable and locale-independent — the UI derives a
  // human month label from this itself (Intl.DateTimeFormat, per-language).
  monthKey: string
  // An i18n key naming a broad, generic Indian seasonal period this month
  // falls in (see SEASON_BY_MONTH below) — an editorial simplification for
  // a relatable "why did this month look different" label, not a precise
  // agro-climatic or region-specific classification. The same honesty
  // posture as festivalCalendar.ts's demandSurgePercent: a labelled
  // heuristic, not sourced data.
  seasonLabelKey: string
  sales: number
  expenses: number
  udhaarGiven: number
  udhaarRepaid: number
  netSurplus: number
}

export interface LedgerSummary {
  totalSales: number
  totalExpenses: number
  netSurplus: number
  // 0 when totalSales is 0 — never divide-by-zero into NaN/Infinity.
  netMarginPercent: number
  totalUdhaarGiven: number
  totalUdhaarRepaid: number
  pendingUdhaar: number
  // 100 (fully recovered, vacuously) when nothing was ever given on credit.
  udhaarRecoveryRatePercent: number
  digitalSharePercent: number
  transactionCount: number
  activeDayCount: number
  monthBuckets: MonthBucket[]
}

// Deliberately coarse and non-regional — see MonthBucket.seasonLabelKey.
// Indexed 0 (January) through 11 (December).
const SEASON_BY_MONTH: string[] = [
  'ledger.season.winter', // Jan
  'ledger.season.winter', // Feb
  'ledger.season.summer', // Mar
  'ledger.season.summer', // Apr
  'ledger.season.summer', // May
  'ledger.season.monsoon', // Jun
  'ledger.season.monsoon', // Jul
  'ledger.season.monsoon', // Aug
  'ledger.season.postMonsoon', // Sep
  'ledger.season.preFestive', // Oct
  'ledger.season.festive', // Nov
  'ledger.season.postFestive', // Dec
]

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function emptyBucket(monthKey: string, monthIndex: number): MonthBucket {
  return {
    monthKey,
    seasonLabelKey: SEASON_BY_MONTH[monthIndex] ?? 'ledger.season.summer',
    sales: 0,
    expenses: 0,
    udhaarGiven: 0,
    udhaarRepaid: 0,
    netSurplus: 0,
  }
}

// Builds `monthWindow` consecutive empty buckets ending at asOfDate's
// month, oldest first — so a month with zero transactions still appears
// (as a real, visible zero), rather than silently disappearing from the
// trend the way a plain group-by would.
function buildMonthWindow(asOfDate: Date, monthWindow: number): MonthBucket[] {
  const buckets: MonthBucket[] = []
  for (let i = monthWindow - 1; i >= 0; i -= 1) {
    const d = new Date(asOfDate.getFullYear(), asOfDate.getMonth() - i, 1)
    buckets.push(emptyBucket(monthKeyOf(d), d.getMonth()))
  }
  return buckets
}

export function summarizeLedger(transactions: LedgerTransaction[], asOfDate: Date = new Date(), monthWindow = 4): LedgerSummary {
  const monthBuckets = buildMonthWindow(asOfDate, monthWindow)
  const bucketByKey = new Map(monthBuckets.map((b) => [b.monthKey, b]))

  let totalSales = 0
  let totalExpenses = 0
  let totalUdhaarGiven = 0
  let totalUdhaarRepaid = 0
  let digitalSales = 0
  const activeDays = new Set<string>()

  for (const txn of transactions) {
    const occurredAt = toDate(txn.occurredAt)
    const dayKey = occurredAt.toISOString().slice(0, 10)
    activeDays.add(dayKey)

    const bucket = bucketByKey.get(monthKeyOf(occurredAt))

    switch (txn.type) {
      case 'sale':
        totalSales += txn.amount
        if (txn.paymentMode === 'upi') digitalSales += txn.amount
        if (bucket) bucket.sales += txn.amount
        break
      case 'expense':
        totalExpenses += txn.amount
        if (bucket) bucket.expenses += txn.amount
        break
      case 'udhaar_given':
        totalUdhaarGiven += txn.amount
        if (bucket) bucket.udhaarGiven += txn.amount
        break
      case 'udhaar_repaid':
        totalUdhaarRepaid += txn.amount
        if (bucket) bucket.udhaarRepaid += txn.amount
        break
    }
  }

  for (const bucket of monthBuckets) {
    bucket.netSurplus = bucket.sales - bucket.expenses
  }

  const netSurplus = totalSales - totalExpenses
  const pendingUdhaar = Math.max(0, totalUdhaarGiven - totalUdhaarRepaid)

  return {
    totalSales,
    totalExpenses,
    netSurplus,
    netMarginPercent: totalSales > 0 ? (netSurplus / totalSales) * 100 : 0,
    totalUdhaarGiven,
    totalUdhaarRepaid,
    pendingUdhaar,
    udhaarRecoveryRatePercent: totalUdhaarGiven > 0 ? Math.min(100, (totalUdhaarRepaid / totalUdhaarGiven) * 100) : 100,
    digitalSharePercent: totalSales > 0 ? (digitalSales / totalSales) * 100 : 0,
    transactionCount: transactions.length,
    activeDayCount: activeDays.size,
    monthBuckets,
  }
}
