import { createFakeRedis } from '../../testUtils/fakeRedis.js'
import { describe, expect, it, vi } from 'vitest'
import type { LedgerTransaction } from '@setu/core'
import type { LlmProvider, LlmTier } from '../../llm/client.js'
import { chat, ValidationError } from './service.js'
import type { AdvisorSaathiDeps } from './service.js'

function makeLlmProvider(fn: LlmProvider['generate']): LlmProvider {
  return { generate: fn }
}

const sampleTransactions: LedgerTransaction[] = [
  { id: 't1', type: 'sale', amount: 2000, paymentMode: 'upi', occurredAt: '2026-09-01T00:00:00.000Z' },
  { id: 't2', type: 'expense', amount: 500, paymentMode: 'cash', occurredAt: '2026-09-02T00:00:00.000Z' },
]

function makeDeps(overrides: Partial<AdvisorSaathiDeps> = {}): AdvisorSaathiDeps {
  const redis = createFakeRedis()
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: {} as any,
    redis,
    llmProvider: makeLlmProvider(async () => 'Your net surplus is ₹1,500.'),
    getTransactionsByApplicantId: vi.fn(async () => sampleTransactions),
    ...overrides,
  }
}

describe('chat', () => {
  it('rejects an empty question without calling the LLM or reading the ledger', async () => {
    const deps = makeDeps()
    await expect(chat(deps, 'applicant-1', { question: '' })).rejects.toThrow(ValidationError)
    expect(deps.getTransactionsByApplicantId).not.toHaveBeenCalled()
  })

  it('reads only the caller applicantId, never a client-supplied one', async () => {
    const deps = makeDeps()
    await chat(deps, 'applicant-1', { question: 'How is my business doing?' })
    expect(deps.getTransactionsByApplicantId).toHaveBeenCalledWith('applicant-1')
  })

  it('builds claims/numbers grounded in the real ledger figures and returns them for the "Inspect Data Fed to AI" panel', async () => {
    const deps = makeDeps()
    const result = await chat(deps, 'applicant-1', { question: 'How is my business doing?' })

    expect(result.numbers.totalSales).toBe(2000)
    expect(result.numbers.totalExpenses).toBe(500)
    expect(result.numbers.netSurplus).toBe(1500)
    expect(result.claims.some((c) => c.sourceId === 'ledger')).toBe(true)
    expect(result.claims.some((c) => c.sourceId === 'creditScore')).toBe(true)
    // Every claim carries a source and a data-vintage — CLAUDE.md boundary rule 3.
    for (const claim of result.claims) {
      expect(claim.sourceId.length).toBeGreaterThan(0)
      expect(claim.dataVintage.length).toBeGreaterThan(0)
    }
  })

  it('degrades to the deterministic template, never throwing, when the LLM is unreachable', async () => {
    const deps = makeDeps({ llmProvider: makeLlmProvider(async () => { throw new Error('unreachable') }) })
    const result = await chat(deps, 'applicant-1', { question: 'How is my business doing?' })
    expect(result.narrationSource).toBe('template')
    expect(result.answer.length).toBeGreaterThan(0)
  })

  it('rejects an answer that invents a number outside the ledger-derived numbers map', async () => {
    const deps = makeDeps({ llmProvider: makeLlmProvider(async () => 'Your net surplus is ₹99,999.') })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await chat(deps, 'applicant-1', { question: 'How is my business doing?' })
    expect(result.narrationSource).toBe('template')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('uses the fast tier by default (spread-out similarity, no accidental ambiguity escalation)', async () => {
    let capturedTier: LlmTier | null = null
    const deps = makeDeps({
      llmProvider: makeLlmProvider(async (tier) => {
        capturedTier = tier
        return 'Your net surplus is ₹1,500.'
      }),
    })
    await chat(deps, 'applicant-1', { question: 'How is my business doing?' })
    expect(capturedTier).toBe('fast')
  })
})
