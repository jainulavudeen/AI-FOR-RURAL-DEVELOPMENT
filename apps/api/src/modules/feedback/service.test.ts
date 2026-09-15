import { describe, expect, it } from 'vitest'
import {
  ForbiddenError,
  NotFoundError,
  assertOfficer,
  createAppeal,
  createFlag,
  getOfficerQueue,
  pickOfficerByLoad,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
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
