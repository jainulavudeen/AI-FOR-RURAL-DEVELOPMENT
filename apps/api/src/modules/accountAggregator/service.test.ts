import { describe, expect, it } from 'vitest'
import { MockAccountAggregatorProvider } from './provider'
import { ForbiddenError, fetchAndDeriveMargin, getConsentStatus, requestConsent, type AccountAggregatorDeps, type FetchLogInput } from './service'
import type { ConsentRecord, ConsentScope } from './types'

const SCOPE: ConsentScope = {
  fiTypes: ['DEPOSIT'],
  purposeCode: '101',
  purposeText: 'Margin capital assessment',
  dataRangeFrom: '2025-07-01',
  dataRangeTo: '2026-01-01',
  fetchType: 'ONETIME',
}

function makeDeps() {
  const provider = new MockAccountAggregatorProvider()
  const consentUpdates: Array<{ applicantId: string; consent: ConsentRecord }> = []
  const fetchLogs: FetchLogInput[] = []

  const deps: AccountAggregatorDeps = {
    provider,
    updateApplicantConsent: async (applicantId, consent) => {
      consentUpdates.push({ applicantId, consent })
    },
    writeFetchLog: async (input) => {
      fetchLogs.push(input)
    },
  }

  return { deps, consentUpdates, fetchLogs }
}

describe('requestConsent', () => {
  it('records the consent against the requesting applicant', async () => {
    const { deps, consentUpdates } = makeDeps()
    const consent = await requestConsent(deps, 'applicant-1', SCOPE)
    expect(consent.status).toBe('active')
    expect(consentUpdates).toEqual([{ applicantId: 'applicant-1', consent }])
  })
})

describe('getConsentStatus', () => {
  it("rejects checking another applicant's consent", async () => {
    const { deps } = makeDeps()
    const consent = await requestConsent(deps, 'applicant-1', SCOPE)
    await expect(getConsentStatus(deps, 'applicant-2', consent.consentId)).rejects.toThrow(ForbiddenError)
  })

  it("returns the real status for the consent's own owner", async () => {
    const { deps } = makeDeps()
    const consent = await requestConsent(deps, 'applicant-1', SCOPE)
    await expect(getConsentStatus(deps, 'applicant-1', consent.consentId)).resolves.toBe('active')
  })
})

describe('fetchAndDeriveMargin', () => {
  it('rejects fetching against another applicant\'s consent, and logs the rejected attempt', async () => {
    const { deps, fetchLogs } = makeDeps()
    const consent = await requestConsent(deps, 'applicant-1', SCOPE)

    await expect(fetchAndDeriveMargin(deps, 'applicant-2', consent.consentId, { purpose: 'test' })).rejects.toThrow(ForbiddenError)

    expect(fetchLogs).toHaveLength(1)
    expect(fetchLogs[0]).toMatchObject({ applicantId: 'applicant-2', status: 'failure' })
  })

  it('derives a margin figure and logs a successful fetch, for audit', async () => {
    const { deps, fetchLogs } = makeDeps()
    const consent = await requestConsent(deps, 'applicant-1', SCOPE)

    const result = await fetchAndDeriveMargin(deps, 'applicant-1', consent.consentId, { purpose: 'margin_capital_assessment' })

    expect(result.estimatedMarginCapital).toBeGreaterThanOrEqual(0)
    expect(result.monthsAnalyzed).toBeGreaterThan(0)
    expect(fetchLogs).toHaveLength(1)
    expect(fetchLogs[0]).toMatchObject({ applicantId: 'applicant-1', status: 'success', purpose: 'margin_capital_assessment' })
    expect(fetchLogs[0]?.recordCount).toBeGreaterThan(0)
  })

  it('logs a failed attempt for a consent id that was never issued (unowned, rejected before an active-check)', async () => {
    const { deps, fetchLogs } = makeDeps()
    await expect(fetchAndDeriveMargin(deps, 'applicant-1', 'never-issued', { purpose: 'test' })).rejects.toThrow(ForbiddenError)
    expect(fetchLogs).toHaveLength(1)
    expect(fetchLogs[0]?.status).toBe('failure')
  })
})
