import { describe, expect, it, vi } from 'vitest'
import { getCreditScore } from './service'
import type { CreditScoreDeps } from './service'
import type { LedgerTransaction } from '@setu/core'

function makeDeps(transactions: LedgerTransaction[] = []): CreditScoreDeps {
  return { getTransactionsByApplicantId: vi.fn(async () => transactions) }
}

describe('getCreditScore', () => {
  it('returns the score floor (300) with an empty ledger — never NaN/undefined', async () => {
    const deps = makeDeps([])
    const result = await getCreditScore(deps, 'applicant-1', new Date('2026-09-21'))
    expect(result.score).toBe(300)
    expect(result.verdictKey).toBe('creditScore.verdict.needsWork')
    expect(result.pillars).toHaveLength(4)
    for (const pillar of result.pillars) {
      expect(Number.isFinite(pillar.pointsEarned)).toBe(true)
      expect(pillar.pointsEarned).toBeGreaterThanOrEqual(0)
    }
  })

  it('scores higher with regular logging, healthy udhaar recovery, and digital sales', async () => {
    const transactions: LedgerTransaction[] = []
    for (let d = 0; d < 90; d += 1) {
      transactions.push({
        id: `sale-${d}`,
        type: 'sale',
        amount: 2500,
        paymentMode: d % 2 === 0 ? 'upi' : 'cash',
        occurredAt: new Date(Date.UTC(2026, 5, 1 + d)).toISOString(),
      })
    }
    transactions.push({
      id: 'udhaar-given',
      type: 'udhaar_given',
      amount: 500,
      paymentMode: 'cash',
      occurredAt: '2026-07-01T00:00:00.000Z',
      customerName: 'Ravi',
    })
    transactions.push({
      id: 'udhaar-repaid',
      type: 'udhaar_repaid',
      amount: 500,
      paymentMode: 'cash',
      occurredAt: '2026-08-01T00:00:00.000Z',
      customerName: 'Ravi',
    })

    const deps = makeDeps(transactions)
    const result = await getCreditScore(deps, 'applicant-1', new Date('2026-09-21'))
    expect(result.score).toBeGreaterThan(600)
    expect(deps.getTransactionsByApplicantId).toHaveBeenCalledWith('applicant-1')
  })
})
