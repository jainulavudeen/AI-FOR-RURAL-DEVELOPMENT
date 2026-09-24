import { describe, expect, it, vi } from 'vitest'
import {
  getAppeals,
  getAuditLog,
  getOfficerStats,
  getReports,
  reassignAppeal,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type AdminDeps,
  type AppealStatRow,
} from './service'
import type { AdminAppealListItem } from './types'

function makeDeps(overrides: Partial<AdminDeps> = {}): AdminDeps {
  return {
    listOfficers: vi.fn(async () => []),
    listAppealStatRows: vi.fn(async () => []),
    listReports: vi.fn(async () => []),
    listAppeals: vi.fn(async () => []),
    getAppealById: vi.fn(async () => null),
    getApplicantRole: vi.fn(async () => null),
    reassignAppealOfficer: vi.fn(async () => ({}) as AdminAppealListItem),
    insertAuditLogEntry: vi.fn(async () => {}),
    listAuditLog: vi.fn(async () => []),
    ...overrides,
  }
}

// Item 6's explicit ask: "Write tests proving an officer token cannot
// reach an admin endpoint." Every admin service function is exercised
// here with an officer role (and, for good measure, an applicant role) —
// all must reject identically to a stranger with no role at all. This is
// the server-side enforcement itself, not a UI check, so it can't be
// bypassed by calling the API directly.
describe('every admin function rejects a non-admin role, including a valid officer token', () => {
  const deps = makeDeps()

  it.each(['officer', 'applicant', 'nonsense'])('getOfficerStats rejects role=%s', async (role) => {
    await expect(getOfficerStats(deps, role)).rejects.toThrow(ForbiddenError)
  })

  it.each(['officer', 'applicant'])('getReports rejects role=%s', async (role) => {
    await expect(getReports(deps, role, {})).rejects.toThrow(ForbiddenError)
  })

  it.each(['officer', 'applicant'])('getAppeals rejects role=%s', async (role) => {
    await expect(getAppeals(deps, role, {})).rejects.toThrow(ForbiddenError)
  })

  it.each(['officer', 'applicant'])('reassignAppeal rejects role=%s', async (role) => {
    await expect(reassignAppeal(deps, 'actor-1', role, 'appeal-1', { officerId: 'officer-2' })).rejects.toThrow(ForbiddenError)
  })

  it.each(['officer', 'applicant'])('getAuditLog rejects role=%s', async (role) => {
    await expect(getAuditLog(deps, role, {})).rejects.toThrow(ForbiddenError)
  })

  it('accepts role=admin for every function (sanity check the rejection above is about role, not a broken mock)', async () => {
    await expect(getOfficerStats(deps, 'admin')).resolves.toEqual([])
    await expect(getReports(deps, 'admin', {})).resolves.toEqual([])
    await expect(getAppeals(deps, 'admin', {})).resolves.toEqual([])
    await expect(getAuditLog(deps, 'admin', {})).resolves.toEqual([])
  })
})

describe('getOfficerStats', () => {
  it('computes pending/resolved/rejected/escalated counts and average resolution time per officer', async () => {
    const rows: AppealStatRow[] = [
      { assignedOfficerId: 'o1', status: 'pending', createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z') },
      {
        assignedOfficerId: 'o1',
        status: 'resolved',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-03T00:00:00Z'), // 48h later
      },
      {
        assignedOfficerId: 'o1',
        status: 'rejected',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-02T00:00:00Z'), // 24h later
      },
      { assignedOfficerId: 'o1', status: 'escalated', createdAt: new Date(), updatedAt: new Date() },
      { assignedOfficerId: 'o2', status: 'pending', createdAt: new Date(), updatedAt: new Date() },
    ]
    const deps = makeDeps({
      listOfficers: vi.fn(async () => [
        { id: 'o1', phone: '+911111111111' },
        { id: 'o2', phone: '+912222222222' },
      ]),
      listAppealStatRows: vi.fn(async () => rows),
    })

    const stats = await getOfficerStats(deps, 'admin')
    const o1 = stats.find((s) => s.officerId === 'o1')!
    const o2 = stats.find((s) => s.officerId === 'o2')!

    expect(o1.pendingCount).toBe(1)
    expect(o1.resolvedCount).toBe(1)
    expect(o1.rejectedCount).toBe(1)
    expect(o1.escalatedCount).toBe(1)
    expect(o1.avgResolutionHours).toBe(36) // (48 + 24) / 2

    expect(o2.pendingCount).toBe(1)
    expect(o2.avgResolutionHours).toBeNull() // never resolved/rejected anything — honest null, not 0
  })
})

describe('reassignAppeal', () => {
  it('404s when the appeal does not exist', async () => {
    const deps = makeDeps({ getAppealById: vi.fn(async () => null) })
    await expect(reassignAppeal(deps, 'admin-1', 'admin', 'missing', { officerId: 'officer-1' })).rejects.toThrow(NotFoundError)
  })

  it('refuses to reassign to someone who is not actually an officer', async () => {
    const deps = makeDeps({
      getAppealById: vi.fn(async () => ({ id: 'a1', assignedOfficerId: 'officer-1' })),
      getApplicantRole: vi.fn(async () => 'applicant'),
    })
    await expect(reassignAppeal(deps, 'admin-1', 'admin', 'a1', { officerId: 'someone-1' })).rejects.toThrow(ValidationError)
  })

  it('reassigns and writes an audit log entry recording the change', async () => {
    const deps = makeDeps({
      getAppealById: vi.fn(async () => ({ id: 'a1', assignedOfficerId: 'officer-1' })),
      getApplicantRole: vi.fn(async () => 'officer'),
      reassignAppealOfficer: vi.fn(async () => ({ id: 'a1', assignedOfficerId: 'officer-2' }) as AdminAppealListItem),
    })

    const result = await reassignAppeal(deps, 'admin-1', 'admin', 'a1', { officerId: 'officer-2' })

    expect(result.assignedOfficerId).toBe('officer-2')
    expect(deps.insertAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorRole: 'admin',
        action: 'appeal_reassigned',
        targetType: 'appeal',
        targetId: 'a1',
        metadata: expect.objectContaining({ fromOfficerId: 'officer-1', toOfficerId: 'officer-2' }),
      })
    )
  })

  it('never approves/resolves anything itself — admin never calls the officer-only status update path', async () => {
    // Structural check, not a runtime one: AdminDeps has no field shaped
    // like an appeal-status/approval writer, only a reassignment one —
    // confirmed by TypeScript at compile time. This test documents the
    // intent so a future edit that adds one gets noticed in review.
    const deps = makeDeps()
    expect(Object.keys(deps)).not.toContain('updateAppealStatus')
    expect(Object.keys(deps)).not.toContain('approveDossier')
  })
})
