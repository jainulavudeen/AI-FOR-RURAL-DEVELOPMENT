import { describe, expect, it } from 'vitest'
import { computeApprovalSignatureHash } from '../../lib/approvalSignature.js'
import { pickOfficerForBlock } from './assignment.js'
import {
  createApplication,
  decide,
  getOne,
  listAssigned,
  reassign,
  reviseApplication,
  startReview,
  submitApplication,
  verifyApproval,
  type ApplicationsDeps,
  type OfficerProfile,
} from './service.js'
import type { ApplicationDecision, ApplicationRecord, ReportSummary } from './types.js'

describe('pickOfficerForBlock', () => {
  it('returns null (→ admin unassigned queue) when nobody covers the block', () => {
    expect(pickOfficerForBlock([])).toBeNull()
  })

  it('prefers an officer assigned the exact block over one covering the whole district', () => {
    expect(
      pickOfficerForBlock([
        { officerId: 'district-wide', scope: 'district', openCount: 0 },
        { officerId: 'block-specific', scope: 'block', openCount: 5 },
      ])
    ).toBe('block-specific')
  })

  it('among equally specific officers, picks the fewest open cases', () => {
    expect(
      pickOfficerForBlock([
        { officerId: 'a', scope: 'block', openCount: 3 },
        { officerId: 'b', scope: 'block', openCount: 1 },
        { officerId: 'c', scope: 'block', openCount: 2 },
      ])
    ).toBe('b')
  })

  it('breaks a tie deterministically on the first-listed (id-sorted) officer', () => {
    expect(
      pickOfficerForBlock([
        { officerId: 'a', scope: 'district', openCount: 1 },
        { officerId: 'b', scope: 'district', openCount: 1 },
      ])
    ).toBe('a')
  })
})

// In-memory fake of the DB-backed deps — enough to drive the state machine
// end to end.
function makeWorld() {
  let seq = 0
  const id = (p: string) => `${p}-${++seq}`
  let clock = new Date('2026-09-25T10:00:00.000Z')
  const reports = new Map<string, ReportSummary>()
  const apps = new Map<string, ApplicationRecord>()
  const decisions: ApplicationDecision[] = []
  const events: Array<{ applicationId: string; toStatus: string }> = []
  const audit: Array<{ action: string; targetId: string }> = []
  const officers = new Map<string, OfficerProfile>()
  // blockId → covering officers (scope implied 'block' for simplicity)
  const coverage = new Map<string, string[]>()

  const addReport = (applicantId: string, blockId = 'block-melur') => {
    const r: ReportSummary = {
      id: id('report'),
      applicantId,
      inputs: { stateId: 'tamil_nadu', districtId: 'madurai', blockId },
      score: 70,
      verdictKey: 'verdict.viable',
      matchedSchemeId: 'micro_finance',
      createdAt: clock.toISOString(),
    }
    reports.set(r.id, r)
    return r
  }
  const addOfficer = (officerId: string, blocks: string[], profile: Partial<OfficerProfile> = {}) => {
    officers.set(officerId, { id: officerId, role: 'officer', active: true, displayName: `Officer ${officerId}`, designation: 'Block Development Officer', ...profile })
    for (const b of blocks) coverage.set(b, [...(coverage.get(b) ?? []), officerId])
  }

  const deps: ApplicationsDeps = {
    now: () => clock,
    getReport: async (rid) => reports.get(rid) ?? null,
    getApplication: async (aid) => apps.get(aid) ?? null,
    getApplicationByReport: async (applicantId, reportId) =>
      [...apps.values()].find((a) => a.applicantId === applicantId && a.reportId === reportId) ?? null,
    insertApplication: async ({ applicantId, reportId }) => {
      const a: ApplicationRecord = {
        id: id('app'),
        applicantId,
        reportId,
        dossierId: null,
        districtId: null,
        blockId: null,
        status: 'draft',
        assignedOfficerId: null,
        submittedAt: null,
        createdAt: clock.toISOString(),
        updatedAt: clock.toISOString(),
      }
      apps.set(a.id, a)
      return a
    },
    updateApplication: async (aid, patch) => {
      const next = { ...apps.get(aid)!, ...patch } as ApplicationRecord
      apps.set(aid, next)
      return next
    },
    insertEvent: async (e) => void events.push(e),
    insertDecision: async (input) => {
      const d: ApplicationDecision = { ...input, id: id('decision'), decidedAt: input.decidedAt.toISOString() }
      decisions.push(d)
      return d
    },
    getLatestDecision: async (aid) => [...decisions].reverse().find((d) => d.applicationId === aid) ?? null,
    getDecisionByHash: async (hash) => decisions.find((d) => d.signatureHash === hash) ?? null,
    resolveLocation: async (inputs) => ({ districtId: 'district-madurai', blockId: String(inputs.blockId) }),
    findCoveringOfficers: async (_districtId, blockId) => {
      const ids = (blockId && coverage.get(blockId)) || []
      return ids
        .filter((o) => officers.get(o)?.active)
        .sort()
        .map((officerId) => ({
          officerId,
          scope: 'block' as const,
          openCount: [...apps.values()].filter((a) => a.assignedOfficerId === officerId && ['submitted', 'under_review'].includes(a.status)).length,
        }))
    },
    getOfficerProfile: async (oid) => officers.get(oid) ?? null,
    createDossier: async () => id('dossier'),
    getDossierDocRef: async () => 'VS-TEST0001',
    hydrate: async (records) =>
      records.map((r) => ({ ...r, report: reports.get(r.reportId) ?? null, location: { stateId: null, districtName: null, blockName: null }, assignedOfficer: null, events: [], latestDecision: null })),
    listByApplicant: async (aid) => [...apps.values()].filter((a) => a.applicantId === aid),
    listByOfficer: async (oid) => [...apps.values()].filter((a) => a.assignedOfficerId === oid),
    listAll: async () => [...apps.values()],
    insertAuditLogEntry: async (e) => void audit.push(e),
  }
  return {
    deps,
    apps,
    decisions,
    events,
    audit,
    officers,
    addReport,
    addOfficer,
    tick: (ms = 60_000) => (clock = new Date(clock.getTime() + ms)),
  }
}

const APPLICANT = { id: 'applicant-1', role: 'applicant' }
const OFFICER = (id: string) => ({ id, role: 'officer' })
const ADMIN = { id: 'admin-1', role: 'admin' }

describe('applicant → officer → verified approval, end to end', () => {
  it('draft → submitted (auto-assigned by jurisdiction) → under_review → approved, with a verifiable hash', async () => {
    const w = makeWorld()
    w.addOfficer('officer-melur', ['block-melur'])
    const report = w.addReport(APPLICANT.id)

    const draft = await createApplication(w.deps, APPLICANT, { reportId: report.id })
    expect(draft.status).toBe('draft')

    const submitted = await submitApplication(w.deps, APPLICANT, draft.id)
    expect(submitted.status).toBe('submitted')
    expect(submitted.assignedOfficerId).toBe('officer-melur')
    expect(submitted.dossierId).toMatch(/^dossier-/)

    await startReview(w.deps, OFFICER('officer-melur'), draft.id)
    const approved = await decide(w.deps, OFFICER('officer-melur'), draft.id, { decision: 'approved' })
    expect(approved.status).toBe('approved')

    const decision = w.decisions[0]!
    expect(decision.officerName).toBe('Officer officer-melur')
    expect(decision.officerDesignation).toBe('Block Development Officer')
    expect(decision.signatureHash).toBe(computeApprovalSignatureHash(draft.id, 'officer-melur', new Date(decision.decidedAt)))

    const verified = await verifyApproval(w.deps, decision.signatureHash!)
    expect(verified).toEqual({
      valid: true,
      officerName: 'Officer officer-melur',
      officerDesignation: 'Block Development Officer',
      approvedAt: decision.decidedAt,
      current: true,
      docRef: 'VS-TEST0001',
    })
    // Nothing about the applicant leaks from the public verification.
    expect(JSON.stringify(verified)).not.toContain(APPLICANT.id)

    expect(w.events.map((e) => e.toStatus)).toEqual(['draft', 'submitted', 'under_review', 'approved'])
    expect(w.audit.map((a) => a.action)).toEqual([
      'application_created',
      'application_submitted',
      'application_assigned',
      'application_review_started',
      'application_approved',
    ])
  })

  it('goes to the unassigned queue when no officer covers the block, and the admin can assign it', async () => {
    const w = makeWorld()
    w.addOfficer('officer-melur', ['block-melur'])
    const report = w.addReport(APPLICANT.id, 'block-uncovered')
    const app = await createApplication(w.deps, APPLICANT, { reportId: report.id })
    const submitted = await submitApplication(w.deps, APPLICANT, app.id)
    expect(submitted.assignedOfficerId).toBeNull()
    expect(w.audit.at(-1)?.action).toBe('application_unassigned')

    const assigned = await reassign(w.deps, ADMIN, app.id, { officerId: 'officer-melur' })
    expect(assigned.assignedOfficerId).toBe('officer-melur')
    expect(w.audit.at(-1)?.action).toBe('application_assigned')
  })

  it('sends a submission to the covering officer with the fewest open cases', async () => {
    const w = makeWorld()
    w.addOfficer('officer-a', ['block-melur'])
    w.addOfficer('officer-b', ['block-melur'])
    const first = await createApplication(w.deps, { id: 'x', role: 'applicant' }, { reportId: w.addReport('x').id })
    await submitApplication(w.deps, { id: 'x', role: 'applicant' }, first.id) // → officer-a (tie, first by id)
    const second = await createApplication(w.deps, APPLICANT, { reportId: w.addReport(APPLICANT.id).id })
    const routed = await submitApplication(w.deps, APPLICANT, second.id)
    expect(routed.assignedOfficerId).toBe('officer-b')
  })

  it('more_info requires a note, returns to the same officer on resubmit, and keeps the note on record', async () => {
    const w = makeWorld()
    w.addOfficer('officer-a', ['block-melur'])
    w.addOfficer('officer-b', ['block-melur'])
    const app = await createApplication(w.deps, APPLICANT, { reportId: w.addReport(APPLICANT.id).id })
    await submitApplication(w.deps, APPLICANT, app.id)
    await expect(decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'more_info' })).rejects.toMatchObject({ statusCode: 400 })

    const asked = await decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'more_info', note: 'Attach your Udyam certificate' })
    expect(asked.status).toBe('more_info')
    expect(w.decisions[0]?.note).toBe('Attach your Udyam certificate')

    const resubmitted = await submitApplication(w.deps, APPLICANT, app.id, { note: 'Added it' })
    expect(resubmitted.status).toBe('submitted')
    expect(resubmitted.assignedOfficerId).toBe('officer-a')
  })

  it('revising after approval creates new records; the old approval stays valid but is marked superseded', async () => {
    const w = makeWorld()
    w.addOfficer('officer-a', ['block-melur'])
    const app = await createApplication(w.deps, APPLICANT, { reportId: w.addReport(APPLICANT.id).id })
    await submitApplication(w.deps, APPLICANT, app.id)
    await decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'approved' })
    const firstHash = w.decisions[0]!.signatureHash!

    w.tick()
    const revised = await reviseApplication(w.deps, APPLICANT, app.id, { reportId: w.addReport(APPLICANT.id).id })
    expect(revised.status).toBe('draft')
    expect(w.decisions).toHaveLength(1) // the approval row itself is untouched

    const check = await verifyApproval(w.deps, firstHash)
    expect(check).toMatchObject({ valid: true, current: false })

    await submitApplication(w.deps, APPLICANT, app.id)
    w.tick()
    await decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'approved' })
    expect(w.decisions).toHaveLength(2)
    expect(w.decisions[1]!.signatureHash).not.toBe(firstHash)
    expect(await verifyApproval(w.deps, w.decisions[1]!.signatureHash!)).toMatchObject({ valid: true, current: true })
  })
})

describe('who may do what', () => {
  async function submittedApp() {
    const w = makeWorld()
    w.addOfficer('officer-a', ['block-melur'])
    w.addOfficer('officer-other', ['block-elsewhere'])
    const app = await createApplication(w.deps, APPLICANT, { reportId: w.addReport(APPLICANT.id).id })
    await submitApplication(w.deps, APPLICANT, app.id)
    return { w, app }
  }

  it('an officer cannot see or decide an application assigned to someone else', async () => {
    const { w, app } = await submittedApp()
    await expect(getOne(w.deps, OFFICER('officer-other'), app.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(decide(w.deps, OFFICER('officer-other'), app.id, { decision: 'approved' })).rejects.toMatchObject({ statusCode: 404 })
    expect(await listAssigned(w.deps, OFFICER('officer-other'))).toEqual([])
  })

  it('another applicant cannot see it; an admin can see it but cannot decide it', async () => {
    const { w, app } = await submittedApp()
    await expect(getOne(w.deps, { id: 'applicant-2', role: 'applicant' }, app.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(getOne(w.deps, ADMIN, app.id)).resolves.toMatchObject({ id: app.id })
    await expect(decide(w.deps, ADMIN, app.id, { decision: 'approved' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('an applicant cannot create an application from someone else\'s report', async () => {
    const w = makeWorld()
    const report = w.addReport('applicant-2')
    await expect(createApplication(w.deps, APPLICANT, { reportId: report.id })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses illegal transitions', async () => {
    const { w, app } = await submittedApp()
    await expect(submitApplication(w.deps, APPLICANT, app.id)).rejects.toMatchObject({ statusCode: 409 }) // already submitted
    await decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'rejected', note: 'Margin too low' })
    await expect(decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'approved' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(startReview(w.deps, OFFICER('officer-a'), app.id)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('an officer without an admin-set designation cannot record a decision', async () => {
    const { w, app } = await submittedApp()
    w.officers.set('officer-a', { ...w.officers.get('officer-a')!, designation: null })
    await expect(decide(w.deps, OFFICER('officer-a'), app.id, { decision: 'approved' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('a deactivated officer is never auto-assigned', async () => {
    const w = makeWorld()
    w.addOfficer('officer-a', ['block-melur'], { active: false })
    const app = await createApplication(w.deps, APPLICANT, { reportId: w.addReport(APPLICANT.id).id })
    const submitted = await submitApplication(w.deps, APPLICANT, app.id)
    expect(submitted.assignedOfficerId).toBeNull()
  })

  it('admin reassignment must target an active officer, and is audited with from/to', async () => {
    const { w, app } = await submittedApp()
    await expect(reassign(w.deps, ADMIN, app.id, { officerId: 'applicant-1' })).rejects.toMatchObject({ statusCode: 400 })
    await reassign(w.deps, ADMIN, app.id, { officerId: 'officer-other' })
    expect(w.apps.get(app.id)?.assignedOfficerId).toBe('officer-other')
    expect(w.audit.at(-1)).toMatchObject({ action: 'application_reassigned', targetId: app.id })
  })

  it('verify rejects malformed or unknown hashes without revealing anything', async () => {
    const w = makeWorld()
    await expect(verifyApproval(w.deps, 'not-a-hash')).resolves.toEqual({ valid: false })
    await expect(verifyApproval(w.deps, 'f'.repeat(64))).resolves.toBeNull() // falls through to the legacy table
  })
})
