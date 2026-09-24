import { describe, expect, it, vi } from 'vitest'
import { getLedgerSummary, listTransactions, recordTransaction, ValidationError } from './service.js'
import type { LedgerDeps } from './service.js'
import type { LedgerTransactionRecord } from './types.js'

const validBody = {
  type: 'sale' as const,
  amount: 500,
  paymentMode: 'upi' as const,
  customerName: null,
  note: null,
}

function makeDeps(overrides: Partial<LedgerDeps> = {}): LedgerDeps {
  return {
    insertTransaction: vi.fn(
      async (input) =>
        ({
          id: 'txn-1',
          ...input,
          occurredAt: input.occurredAt.toISOString(),
          createdAt: new Date().toISOString(),
        }) as LedgerTransactionRecord
    ),
    getTransactionsByApplicantId: vi.fn(async () => []),
    ...overrides,
  }
}

describe('recordTransaction', () => {
  it('rejects an unknown transaction type', async () => {
    const deps = makeDeps()
    await expect(recordTransaction(deps, 'applicant-1', { ...validBody, type: 'bogus' as never })).rejects.toThrow(ValidationError)
    expect(deps.insertTransaction).not.toHaveBeenCalled()
  })

  it('rejects a zero or negative amount', async () => {
    const deps = makeDeps()
    await expect(recordTransaction(deps, 'applicant-1', { ...validBody, amount: 0 })).rejects.toThrow(ValidationError)
    await expect(recordTransaction(deps, 'applicant-1', { ...validBody, amount: -50 })).rejects.toThrow(ValidationError)
  })

  it('rejects an unknown payment mode', async () => {
    const deps = makeDeps()
    await expect(recordTransaction(deps, 'applicant-1', { ...validBody, paymentMode: 'cheque' as never })).rejects.toThrow(ValidationError)
  })

  it('defaults paymentMode to cash and occurredAt to now when absent', async () => {
    const deps = makeDeps()
    const before = Date.now()
    await recordTransaction(deps, 'applicant-1', { type: 'sale', amount: 100 })
    expect(deps.insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ applicantId: 'applicant-1', paymentMode: 'cash' })
    )
    const insertedInput = vi.mocked(deps.insertTransaction).mock.calls[0]?.[0]
    expect(insertedInput?.occurredAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('saves successfully with a fully specified body', async () => {
    const deps = makeDeps()
    const result = await recordTransaction(deps, 'applicant-1', validBody)
    expect(result.id).toBe('txn-1')
    expect(deps.insertTransaction).toHaveBeenCalledWith(expect.objectContaining({ applicantId: 'applicant-1', amount: 500 }))
  })
})

describe('listTransactions', () => {
  it('delegates straight to the deps — no filtering/ownership logic needed, applicantId always comes from the caller', async () => {
    const deps = makeDeps({ getTransactionsByApplicantId: vi.fn(async () => [{ id: 'txn-1' } as LedgerTransactionRecord]) })
    await expect(listTransactions(deps, 'applicant-1')).resolves.toEqual([{ id: 'txn-1' }])
    expect(deps.getTransactionsByApplicantId).toHaveBeenCalledWith('applicant-1')
  })
})

describe('getLedgerSummary', () => {
  it('recomputes from the raw rows every call via the shared @setu/core summarizer', async () => {
    const rows: LedgerTransactionRecord[] = [
      {
        id: 'txn-1',
        type: 'sale',
        amount: 1000,
        paymentMode: 'upi',
        customerName: null,
        note: null,
        source: 'self_reported',
        occurredAt: '2026-09-01T00:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]
    const deps = makeDeps({ getTransactionsByApplicantId: vi.fn(async () => rows) })
    const summary = await getLedgerSummary(deps, 'applicant-1', new Date('2026-09-21'))
    expect(summary.totalSales).toBe(1000)
    expect(summary.digitalSharePercent).toBe(100)
  })
})
