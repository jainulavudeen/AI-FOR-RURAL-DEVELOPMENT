import { describe, expect, it, vi } from 'vitest'
import type { LedgerTransaction } from '@setu/core'
import { generateDossier, getDossier, ForbiddenError, NotFoundError } from './service'
import type { BankDossierDeps } from './service'
import type { BankDossierRecord, DossierSnapshot } from './types'

const sampleTransactions: LedgerTransaction[] = [
  { id: 't1', type: 'sale', amount: 3000, paymentMode: 'upi', occurredAt: '2026-09-01T00:00:00.000Z' },
]

function makeDeps(overrides: Partial<BankDossierDeps> = {}): BankDossierDeps {
  return {
    getTransactionsByApplicantId: vi.fn(async () => sampleTransactions),
    getApplicantPhone: vi.fn(async () => '+919876543001'),
    insertDossier: vi.fn(
      async (input) =>
        ({
          id: 'dossier-1',
          applicantId: input.applicantId,
          schemeId: input.schemeId,
          snapshot: input.snapshot,
          createdAt: new Date().toISOString(),
        }) as BankDossierRecord
    ),
    getDossierById: vi.fn(async () => null),
    ...overrides,
  }
}

describe('generateDossier', () => {
  it('freezes a real financial snapshot built from the applicant\'s own ledger', async () => {
    const deps = makeDeps()
    const dossier = await generateDossier(deps, 'applicant-1', { selection: { businessId: 'retail', stateId: 'uttar_pradesh' } })

    expect(dossier.applicantId).toBe('applicant-1')
    expect(dossier.snapshot.applicantPhone).toBe('+919876543001')
    expect(dossier.snapshot.financial.summary.totalSales).toBe(3000)
    expect(dossier.snapshot.docRef).toMatch(/^VS-[0-9A-F]{8}$/)
  })

  it('leaves proprietorName/bankName honestly null when not provided, never fabricated', async () => {
    const deps = makeDeps()
    const dossier = await generateDossier(deps, 'applicant-1', {})
    expect(dossier.snapshot.proprietorName).toBeNull()
    expect(dossier.snapshot.bankName).toBeNull()
  })

  it('trims and stores self-reported proprietorName/bankName when provided', async () => {
    const deps = makeDeps()
    const dossier = await generateDossier(deps, 'applicant-1', { proprietorName: '  Ramesh Kumar  ', bankName: 'Gramin Bank ' })
    expect(dossier.snapshot.proprietorName).toBe('Ramesh Kumar')
    expect(dossier.snapshot.bankName).toBe('Gramin Bank')
  })
})

describe('getDossier', () => {
  it('throws NotFoundError for a missing id', async () => {
    const deps = makeDeps({ getDossierById: vi.fn(async () => null) })
    await expect(getDossier(deps, 'applicant-1', 'missing-id')).rejects.toThrow(NotFoundError)
  })

  it('refuses a dossier the caller does not own', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'someone-else', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
    })
    await expect(getDossier(deps, 'applicant-1', 'd1')).rejects.toThrow(ForbiddenError)
  })

  it('returns the dossier to its owner', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'applicant-1', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
    })
    await expect(getDossier(deps, 'applicant-1', 'd1')).resolves.toEqual(
      expect.objectContaining({ id: 'd1', applicantId: 'applicant-1' })
    )
  })
})
