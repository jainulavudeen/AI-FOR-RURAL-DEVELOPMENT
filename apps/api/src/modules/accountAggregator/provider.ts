import { createHash, randomUUID } from 'node:crypto'
import type { ConsentRecord, ConsentScope, ConsentStatus, FinancialDataSnapshot, FinancialTransaction } from './types'

export interface AccountAggregatorProvider {
  requestConsent(applicantId: string, scope: ConsentScope): Promise<ConsentRecord>
  getConsentStatus(consentId: string): Promise<ConsentStatus>
  // Ownership check the service layer uses before letting anyone fetch
  // against a consent — a real provider wouldn't need this (we'd track
  // ownership in our own DB when requestConsent is first called); the
  // mock needs it because it's the one holding consent state in memory.
  getConsentOwner(consentId: string): Promise<string | null>
  fetchFinancialData(consentId: string): Promise<FinancialDataSnapshot>
}

function seededRandom(seedStr: string, count: number): number[] {
  let seed = Number.parseInt(createHash('md5').update(seedStr).digest('hex').slice(0, 8), 16) || 1
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    seed = (seed * 9301 + 49297) % 233280
    out.push(seed / 233280)
  }
  return out
}

function generateMockTransactions(applicantId: string): FinancialTransaction[] {
  const rand = seededRandom(applicantId, 12)
  const now = new Date()
  const transactions: FinancialTransaction[] = []

  for (let monthsAgo = 0; monthsAgo < 6; monthsAgo += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 5).toISOString().slice(0, 10)
    const credit = Math.round(8000 + (rand[monthsAgo] ?? 0.5) * 12000)
    const debit = Math.round(5000 + (rand[(monthsAgo + 6) % rand.length] ?? 0.5) * 9000)
    transactions.push({ date, amount: credit, type: 'CREDIT', narration: 'MOCK: Business receipts' })
    transactions.push({ date, amount: debit, type: 'DEBIT', narration: 'MOCK: Household + business expenses' })
  }

  return transactions
}

interface StoredConsent {
  applicantId: string
  status: ConsentStatus
  scope: ConsentScope
}

// The real RBI-AA flow (consent handle -> out-of-band approval in the
// user's AA app -> consent artifact -> encrypted FI data session over
// ECDH) is real-money regulated infrastructure — out of scope to actually
// integrate. This mock lets the whole opt-in flow be demoed with zero AA
// partner credentials: consent is simulated as approved immediately
// (a real one waits for the user to approve on a second device), and
// fetched transactions are deterministic per applicant (repeatable demo,
// not random each time) and always narrated "MOCK:" so they're never
// mistaken for real data mid-demo.
export class MockAccountAggregatorProvider implements AccountAggregatorProvider {
  private readonly consents = new Map<string, StoredConsent>()

  async requestConsent(applicantId: string, scope: ConsentScope): Promise<ConsentRecord> {
    const consentId = `mock-consent-${randomUUID()}`
    this.consents.set(consentId, { applicantId, status: 'active', scope })
    return { consentId, status: 'active', scope }
  }

  async getConsentStatus(consentId: string): Promise<ConsentStatus> {
    return this.consents.get(consentId)?.status ?? 'expired'
  }

  async getConsentOwner(consentId: string): Promise<string | null> {
    return this.consents.get(consentId)?.applicantId ?? null
  }

  async fetchFinancialData(consentId: string): Promise<FinancialDataSnapshot> {
    const consent = this.consents.get(consentId)
    if (!consent || consent.status !== 'active') {
      throw new Error('Consent is not active')
    }
    return {
      accountType: 'DEPOSIT',
      transactions: generateMockTransactions(consent.applicantId),
      isMock: true,
      fetchedAt: new Date().toISOString(),
    }
  }
}

// ACCOUNT_AGGREGATOR_PROVIDER only accepts 'mock' today (see env.ts) — no
// real AA partner is integrated. Kept as a factory anyway, same shape as
// the other providers, so a real implementation slots in without touching
// call sites.
export function createAccountAggregatorProvider(): AccountAggregatorProvider {
  return new MockAccountAggregatorProvider()
}
