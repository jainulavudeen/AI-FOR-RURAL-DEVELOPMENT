import { randomUUID } from 'node:crypto'

// CPGRAMS (pgportal.gov.in) is the Government of India's public grievance
// redressal portal — filing a grievance for real means a genuine
// institutional integration this environment has no credentials or
// partnership for (same class of "real-money/real-institution
// infrastructure genuinely out of scope" as accountAggregator's RBI-AA
// flow — see CLAUDE.md). This adapter exists so the whole escalation state
// machine (escalation.ts) can be built and tested end-to-end today, with a
// real integration slotting in later behind the exact same interface.
export interface CpgramsGrievance {
  applicantPhone: string
  subject: string
  description: string
  reason: 'sla_breach' | 'applicant_requested'
}

export interface CpgramsFilingResult {
  referenceId: string
  filedAt: string
}

export interface CpgramsAdapter {
  fileGrievance(grievance: CpgramsGrievance): Promise<CpgramsFilingResult>
}

// Deterministic-looking but clearly-fake reference id (prefixed MOCK-),
// logged instead of sent — same posture as SMS_PROVIDER=console and
// AGMARKNET_PROVIDER=mock: zero credentials needed to demo the full flow,
// and the output is never mistakable for a real CPGRAMS reference number.
export class MockCpgramsAdapter implements CpgramsAdapter {
  async fileGrievance(grievance: CpgramsGrievance): Promise<CpgramsFilingResult> {
    const referenceId = `MOCK-CPGRAMS-${randomUUID().slice(0, 8).toUpperCase()}`
    const filedAt = new Date().toISOString()
    console.log(`MOCK CPGRAMS: filed grievance for ${grievance.applicantPhone} (${grievance.reason}) -> ${referenceId}`)
    return { referenceId, filedAt }
  }
}

// CPGRAMS_PROVIDER only accepts 'mock' today, same shape as
// ACCOUNT_AGGREGATOR_PROVIDER — kept as a factory so a real integration
// slots in later without touching call sites.
export function createCpgramsAdapter(): CpgramsAdapter {
  return new MockCpgramsAdapter()
}
