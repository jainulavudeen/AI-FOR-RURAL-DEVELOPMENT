import { describe, expect, it, vi } from 'vitest'
import type { CpgramsAdapter } from './cpgramsAdapter'
import { SLA_BREACH_HOURS } from './escalation'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  applicantEscalateAppeal,
  assertOfficer,
  createAppeal,
  createFlag,
  getOfficerQueue,
  pickOfficerByLoad,
  sweepSlaBreaches,
  updateAppealStatus,
  type Appeal,
  type FeedbackDeps,
} from './service'

function makeAppeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 'appeal-1',
    applicantId: 'applicant-1',
    reportId: 'report-1',
    status: 'pending',
    assignedOfficerId: 'officer-1',
    resolutionNote: null,
    escalatedAt: null,
    escalationReason: null,
    cpgramsReferenceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeMockCpgrams(): CpgramsAdapter {
  return { fileGrievance: vi.fn(async () => ({ referenceId: 'MOCK-CPGRAMS-TEST1234', filedAt: new Date().toISOString() })) }
}

function makeDeps(overrides: Partial<FeedbackDeps> = {}): FeedbackDeps {
  return {
    insertFeedbackFlag: async (input) => ({ id: `flag-${input.sourceRowId}` }),
    getCurrentSchemeRuleVersion: async () => ({ id: 'rule-1', version: 1 }),
    insertReport: async () => ({ id: 'report-1' }),
    getOfficerLoads: async () => [],
    insertAppeal: async (input) => makeAppeal({ reportId: input.reportId, assignedOfficerId: input.assignedOfficerId }),
    getOfficerQueue: async () => [],
    getAppealById: async () => makeAppeal(),
    updateAppeal: async (_id, body) => makeAppeal({ status: body.status, resolutionNote: body.resolutionNote ?? null }),
    getOpenAppeals: async () => [],
    updateAppealEscalation: async (id, input) => makeAppeal({ id, status: 'escalated', ...input }),
    getApplicantPhone: async () => '+919999900002',
    cpgrams: makeMockCpgrams(),
    ...overrides,
  }
}

describe('pickOfficerByLoad', () => {
  it('picks the officer with the fewest open appeals, not just the first one', () => {
    const picked = pickOfficerByLoad([
      { officerId: 'a', openCount: 3 },
      { officerId: 'b', openCount: 0 },
      { officerId: 'c', openCount: 1 },
    ])
    expect(picked).toBe('b')
  })

  it('returns null when there are no officers at all', () => {
    expect(pickOfficerByLoad([])).toBeNull()
  })
})

describe('assertOfficer', () => {
  it('rejects a non-officer role', () => {
    expect(() => assertOfficer('applicant')).toThrow(ForbiddenError)
  })

  it('allows the officer role through', () => {
    expect(() => assertOfficer('officer')).not.toThrow()
  })
})

describe('createFlag', () => {
  it('stores the flag under the authenticated applicant, not a client-supplied id', async () => {
    let captured: { applicantId: string } | undefined
    const deps = makeDeps({
      insertFeedbackFlag: async (input) => {
        captured = input
        return { id: 'flag-1' }
      },
    })

    await createFlag(deps, 'real-applicant-id', { sourceTable: 'source.mandi', sourceRowId: 'x|y|z', reason: 'looks wrong' })

    expect(captured?.applicantId).toBe('real-applicant-id')
  })
})

describe('createAppeal', () => {
  it('fails clearly when no active scheme_rules row exists for the matched scheme', async () => {
    const deps = makeDeps({ getCurrentSchemeRuleVersion: async () => null })

    await expect(
      createAppeal(deps, 'applicant-1', {
        inputs: {},
        score: 70,
        verdictKey: 'verdict.moderate',
        matchedSchemeId: 'some_unknown_scheme',
        emiSchedule: [],
      })
    ).rejects.toThrow(NotFoundError)
  })

  it('assigns the least-loaded officer to the new appeal', async () => {
    const deps = makeDeps({
      getOfficerLoads: async () => [
        { officerId: 'busy-officer', openCount: 5 },
        { officerId: 'free-officer', openCount: 0 },
      ],
    })

    const appeal = await createAppeal(deps, 'applicant-1', {
      inputs: { businessId: 'dairy' },
      score: 70,
      verdictKey: 'verdict.moderate',
      matchedSchemeId: 'micro_finance',
      emiSchedule: [],
    })

    expect(appeal.assignedOfficerId).toBe('free-officer')
  })

  it('records marginCapitalSource as self_reported by default, in dataVintage', async () => {
    let capturedVintage: Record<string, unknown> | undefined
    const deps = makeDeps({
      insertReport: async (input) => {
        capturedVintage = input.dataVintage
        return { id: 'report-1' }
      },
    })

    await createAppeal(deps, 'applicant-1', {
      inputs: {},
      score: 70,
      verdictKey: 'verdict.moderate',
      matchedSchemeId: 'micro_finance',
      emiSchedule: [],
    })

    expect(capturedVintage?.marginCapitalSource).toBe('self_reported')
  })

  it('records marginCapitalSource as aa when the client says the margin was AA-verified', async () => {
    let capturedVintage: Record<string, unknown> | undefined
    const deps = makeDeps({
      insertReport: async (input) => {
        capturedVintage = input.dataVintage
        return { id: 'report-1' }
      },
    })

    await createAppeal(deps, 'applicant-1', {
      inputs: {},
      score: 70,
      verdictKey: 'verdict.moderate',
      matchedSchemeId: 'micro_finance',
      emiSchedule: [],
      marginCapitalSource: 'aa',
    })

    expect(capturedVintage?.marginCapitalSource).toBe('aa')
  })
})

describe('getOfficerQueue (role gate)', () => {
  it('rejects a caller whose role is not officer', async () => {
    const deps = makeDeps()
    await expect(getOfficerQueue(deps, 'applicant', 'someone')).rejects.toThrow(ForbiddenError)
  })
})

describe('updateAppealStatus', () => {
  it('rejects a role that is not officer', async () => {
    const deps = makeDeps()
    await expect(updateAppealStatus(deps, 'applicant', 'officer-1', 'appeal-1', { status: 'resolved' })).rejects.toThrow(
      ForbiddenError
    )
  })

  it("rejects an officer updating another officer's assigned appeal", async () => {
    const deps = makeDeps({ getAppealById: async () => makeAppeal({ assignedOfficerId: 'officer-1' }) })

    await expect(
      updateAppealStatus(deps, 'officer', 'officer-2', 'appeal-1', { status: 'resolved' })
    ).rejects.toThrow(ForbiddenError)
  })

  it('allows the assigned officer to update their own appeal', async () => {
    const deps = makeDeps({ getAppealById: async () => makeAppeal({ assignedOfficerId: 'officer-1' }) })

    const result = await updateAppealStatus(deps, 'officer', 'officer-1', 'appeal-1', {
      status: 'resolved',
      resolutionNote: 'Sanctioned after manual review.',
    })

    expect(result.status).toBe('resolved')
    expect(result.resolutionNote).toBe('Sanctioned after manual review.')
  })

  it('404s when the appeal does not exist', async () => {
    const deps = makeDeps({ getAppealById: async () => null })
    await expect(updateAppealStatus(deps, 'officer', 'officer-1', 'missing', { status: 'resolved' })).rejects.toThrow(
      NotFoundError
    )
  })
})

describe('applicantEscalateAppeal', () => {
  it('escalates the applicant\'s own open appeal via the CPGRAMS adapter', async () => {
    const cpgrams = makeMockCpgrams()
    const deps = makeDeps({ getAppealById: async () => makeAppeal({ status: 'in_review' }), cpgrams })
    const result = await applicantEscalateAppeal(deps, 'applicant-1', 'appeal-1')
    expect(result.status).toBe('escalated')
    expect(result.cpgramsReferenceId).toBe('MOCK-CPGRAMS-TEST1234')
    expect(cpgrams.fileGrievance).toHaveBeenCalledWith(expect.objectContaining({ reason: 'applicant_requested' }))
  })

  it('refuses to escalate someone else\'s appeal', async () => {
    const deps = makeDeps({ getAppealById: async () => makeAppeal({ applicantId: 'someone-else' }) })
    await expect(applicantEscalateAppeal(deps, 'applicant-1', 'appeal-1')).rejects.toThrow(ForbiddenError)
  })

  it('refuses to escalate an already-resolved appeal', async () => {
    const deps = makeDeps({ getAppealById: async () => makeAppeal({ status: 'resolved' }) })
    await expect(applicantEscalateAppeal(deps, 'applicant-1', 'appeal-1')).rejects.toThrow(ConflictError)
  })

  it('404s on a missing appeal', async () => {
    const deps = makeDeps({ getAppealById: async () => null })
    await expect(applicantEscalateAppeal(deps, 'applicant-1', 'appeal-1')).rejects.toThrow(NotFoundError)
  })
})

describe('sweepSlaBreaches', () => {
  it('escalates only the appeals past the SLA window, leaving fresh ones alone', async () => {
    const now = new Date('2026-02-01T00:00:00Z')
    const stale = makeAppeal({ id: 'stale', createdAt: new Date(now.getTime() - (SLA_BREACH_HOURS + 1) * 60 * 60 * 1000) })
    const fresh = makeAppeal({ id: 'fresh', createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000) })
    const cpgrams = makeMockCpgrams()
    const deps = makeDeps({ getOpenAppeals: async () => [stale, fresh], cpgrams })

    const escalated = await sweepSlaBreaches(deps, 'officer', now)

    expect(escalated).toHaveLength(1)
    expect(cpgrams.fileGrievance).toHaveBeenCalledTimes(1)
    expect(cpgrams.fileGrievance).toHaveBeenCalledWith(expect.objectContaining({ reason: 'sla_breach' }))
  })

  it('is officer-only', async () => {
    const deps = makeDeps()
    await expect(sweepSlaBreaches(deps, 'applicant')).rejects.toThrow(ForbiddenError)
  })
})
