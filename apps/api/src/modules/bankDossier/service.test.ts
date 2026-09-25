import { describe, expect, it, vi } from 'vitest'
import type { LedgerTransaction } from '@setu/core'
import { generateDossier, getDossier, getDossierApproval, verifyApprovalHash, ForbiddenError, NotFoundError } from './service.js'
import type { BankDossierDeps } from './service.js'
import type { BankDossierRecord, DossierApproval, DossierSnapshot } from './types.js'

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
    officerCanSeeDossier: vi.fn(async () => false),
    getApplicationApproval: vi.fn(async () => null),
    getApprovalsByDossierId: vi.fn(async () => []),
    getApprovalByHash: vi.fn(async () => null),
    insertAuditLogEntry: vi.fn(async () => {}),
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
    await expect(getDossier(deps, 'applicant-1', 'applicant', 'missing-id')).rejects.toThrow(NotFoundError)
  })

  it('refuses a dossier the caller does not own and is not an officer', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'someone-else', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
    })
    await expect(getDossier(deps, 'applicant-1', 'applicant', 'd1')).rejects.toThrow(ForbiddenError)
  })

  it('returns the dossier to its owner', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'applicant-1', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
    })
    await expect(getDossier(deps, 'applicant-1', 'applicant', 'd1')).resolves.toEqual(
      expect.objectContaining({ id: 'd1', applicantId: 'applicant-1' })
    )
  })

  it('lets an officer view a dossier whose application is assigned to them', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'applicant-1', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
      officerCanSeeDossier: vi.fn(async (_dossierId: string, officerId: string) => officerId === 'officer-1'),
    })
    await expect(getDossier(deps, 'officer-1', 'officer', 'd1')).resolves.toEqual(expect.objectContaining({ id: 'd1' }))
  })

  it('refuses an officer who has no assigned application for that dossier', async () => {
    const deps = makeDeps({
      getDossierById: vi.fn(async () => ({ id: 'd1', applicantId: 'applicant-1', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' })),
      officerCanSeeDossier: vi.fn(async () => false),
    })
    await expect(getDossier(deps, 'officer-2', 'officer', 'd1')).rejects.toThrow(ForbiddenError)
  })
})

describe('getDossierApproval', () => {
  const dossier = { id: 'd1', applicantId: 'applicant-1', schemeId: null, snapshot: {} as DossierSnapshot, createdAt: '' }

  it('returns null (→ "Pending review") when nothing approved it', async () => {
    const deps = makeDeps({ getDossierById: vi.fn(async () => dossier) })
    await expect(getDossierApproval(deps, 'applicant-1', 'applicant', 'd1')).resolves.toBeNull()
  })

  it('prefers the applications-flow Verified Approval', async () => {
    const view = { officerName: 'K. Meena', officerDesignation: 'DIC', approvedAt: '2026-09-25T00:00:00.000Z', signatureHash: 'a'.repeat(64), current: true }
    const deps = makeDeps({ getDossierById: vi.fn(async () => dossier), getApplicationApproval: vi.fn(async () => view) })
    await expect(getDossierApproval(deps, 'applicant-1', 'applicant', 'd1')).resolves.toEqual(view)
  })
})

describe('verifyApprovalHash', () => {
  it('reports invalid for an unknown hash', async () => {
    const deps = makeDeps({ getApprovalByHash: vi.fn(async () => null) })
    await expect(verifyApprovalHash(deps, 'not-a-real-hash')).resolves.toEqual({ valid: false })
  })

  it('reports current:true when the hash matches the latest approval', async () => {
    const approval: DossierApproval = {
      id: 'a2',
      dossierId: 'd1',
      officerId: 'officer-1',
      officerName: 'Priya Sharma',
      officerDesignation: 'District Industries Officer',
      signatureHash: 'hash-2',
      approvedAt: '2026-09-24T00:00:00.000Z',
    }
    const older: DossierApproval = { ...approval, id: 'a1', signatureHash: 'hash-1', approvedAt: '2026-09-01T00:00:00.000Z' }
    const deps = makeDeps({
      getApprovalByHash: vi.fn(async () => approval),
      getApprovalsByDossierId: vi.fn(async () => [approval, older]), // newest first
    })

    await expect(verifyApprovalHash(deps, 'hash-2')).resolves.toEqual(
      expect.objectContaining({ valid: true, current: true, officerName: 'Priya Sharma' })
    )
  })

  it('reports current:false for a superseded (re-approved-over) hash — still genuine, just not the latest', async () => {
    const latest: DossierApproval = {
      id: 'a2',
      dossierId: 'd1',
      officerId: 'officer-1',
      officerName: 'Priya Sharma',
      officerDesignation: 'District Industries Officer',
      signatureHash: 'hash-2',
      approvedAt: '2026-09-24T00:00:00.000Z',
    }
    const older: DossierApproval = { ...latest, id: 'a1', signatureHash: 'hash-1', approvedAt: '2026-09-01T00:00:00.000Z' }
    const deps = makeDeps({
      getApprovalByHash: vi.fn(async () => older),
      getApprovalsByDossierId: vi.fn(async () => [latest, older]), // newest first
    })

    await expect(verifyApprovalHash(deps, 'hash-1')).resolves.toEqual(expect.objectContaining({ valid: true, current: false }))
  })
})
