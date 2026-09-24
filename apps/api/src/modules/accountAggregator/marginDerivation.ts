import type { FinancialTransaction } from './types.js'

export interface MarginDerivationResult {
  estimatedMarginCapital: number
  monthsAnalyzed: number
}

// Pure and deterministic given its input — a data-prep step upstream of
// structureFinance() (packages/core), which still receives a plain number
// same as today's manual entry. Doesn't touch packages/core and doesn't
// violate CLAUDE.md rule 1: that rule is about the calculator never
// network-calling, not about upstream inputs being disallowed to have a
// network origin. Average monthly net surplus (credits - debits), floored
// at 0 — a margin capital figure can't be negative.
export function deriveMarginCapital(transactions: FinancialTransaction[]): MarginDerivationResult {
  const byMonth = new Map<string, number>()
  for (const txn of transactions) {
    const month = txn.date.slice(0, 7) // YYYY-MM
    const signed = txn.type === 'CREDIT' ? txn.amount : -txn.amount
    byMonth.set(month, (byMonth.get(month) ?? 0) + signed)
  }

  const monthlyNet = [...byMonth.values()]
  if (monthlyNet.length === 0) {
    return { estimatedMarginCapital: 0, monthsAnalyzed: 0 }
  }

  const averageSurplus = monthlyNet.reduce((sum, v) => sum + v, 0) / monthlyNet.length
  return { estimatedMarginCapital: Math.max(0, Math.round(averageSurplus)), monthsAnalyzed: monthlyNet.length }
}
