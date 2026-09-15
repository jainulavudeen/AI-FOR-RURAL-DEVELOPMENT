import { describe, expect, it } from 'vitest'
import { deriveMarginCapital } from './marginDerivation'
import type { FinancialTransaction } from './types'

describe('deriveMarginCapital', () => {
  it('averages monthly net surplus across the months present', () => {
    const transactions: FinancialTransaction[] = [
      { date: '2026-01-05', amount: 20000, type: 'CREDIT', narration: 'MOCK: receipts' },
      { date: '2026-01-10', amount: 8000, type: 'DEBIT', narration: 'MOCK: expenses' },
      { date: '2026-02-05', amount: 18000, type: 'CREDIT', narration: 'MOCK: receipts' },
      { date: '2026-02-10', amount: 10000, type: 'DEBIT', narration: 'MOCK: expenses' },
    ]
    // Jan surplus: 12000, Feb surplus: 8000 -> average 10000
    const result = deriveMarginCapital(transactions)
    expect(result.estimatedMarginCapital).toBe(10000)
    expect(result.monthsAnalyzed).toBe(2)
  })

  it('floors a negative average surplus at zero rather than returning a negative margin', () => {
    const transactions: FinancialTransaction[] = [
      { date: '2026-01-05', amount: 5000, type: 'CREDIT', narration: 'MOCK: receipts' },
      { date: '2026-01-10', amount: 12000, type: 'DEBIT', narration: 'MOCK: expenses' },
    ]
    const result = deriveMarginCapital(transactions)
    expect(result.estimatedMarginCapital).toBe(0)
  })

  it('returns zero for an empty transaction list, not an error', () => {
    const result = deriveMarginCapital([])
    expect(result).toEqual({ estimatedMarginCapital: 0, monthsAnalyzed: 0 })
  })
})
