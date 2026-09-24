import { deriveMarginCapital } from './marginDerivation.js'
import type { AccountAggregatorProvider } from './provider.js'
import type { ConsentRecord, ConsentScope, ConsentStatus, FetchDataBody } from './types.js'

export class ForbiddenError extends Error {
  statusCode = 403
  code = 'FORBIDDEN'
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

// Every fetch attempt — success or failure — gets one row. "Log what was
// fetched and why, for audit."
export interface FetchLogInput {
  applicantId: string
  consentId: string
  purpose: string
  status: 'success' | 'failure'
  recordCount?: number
  requestedAt: Date
  respondedAt: Date
  errorMessage?: string
}

export interface AccountAggregatorDeps {
  provider: AccountAggregatorProvider
  updateApplicantConsent: (applicantId: string, consent: ConsentRecord) => Promise<void>
  writeFetchLog: (input: FetchLogInput) => Promise<void>
}

export async function requestConsent(deps: AccountAggregatorDeps, applicantId: string, scope: ConsentScope): Promise<ConsentRecord> {
  const consent = await deps.provider.requestConsent(applicantId, scope)
  await deps.updateApplicantConsent(applicantId, consent)
  return consent
}

export async function getConsentStatus(deps: AccountAggregatorDeps, applicantId: string, consentId: string): Promise<ConsentStatus> {
  const owner = await deps.provider.getConsentOwner(consentId)
  if (owner !== applicantId) throw new ForbiddenError('This consent does not belong to you')
  return deps.provider.getConsentStatus(consentId)
}

export interface FetchResult {
  estimatedMarginCapital: number
  monthsAnalyzed: number
}

export async function fetchAndDeriveMargin(
  deps: AccountAggregatorDeps,
  applicantId: string,
  consentId: string,
  body: FetchDataBody
): Promise<FetchResult> {
  const requestedAt = new Date()
  const owner = await deps.provider.getConsentOwner(consentId)
  if (owner !== applicantId) {
    await deps.writeFetchLog({
      applicantId,
      consentId,
      purpose: body.purpose,
      status: 'failure',
      requestedAt,
      respondedAt: new Date(),
      errorMessage: 'Consent does not belong to caller',
    })
    throw new ForbiddenError('This consent does not belong to you')
  }

  try {
    const status = await deps.provider.getConsentStatus(consentId)
    if (status !== 'active') {
      throw new ForbiddenError(`Consent is ${status}, not active`)
    }

    const snapshot = await deps.provider.fetchFinancialData(consentId)
    const derived = deriveMarginCapital(snapshot.transactions)

    await deps.writeFetchLog({
      applicantId,
      consentId,
      purpose: body.purpose,
      status: 'success',
      recordCount: snapshot.transactions.length,
      requestedAt,
      respondedAt: new Date(),
    })

    return derived
  } catch (err) {
    await deps.writeFetchLog({
      applicantId,
      consentId,
      purpose: body.purpose,
      status: 'failure',
      requestedAt,
      respondedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
