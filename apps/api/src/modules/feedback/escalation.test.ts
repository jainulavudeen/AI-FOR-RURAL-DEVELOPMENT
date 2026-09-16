import { describe, expect, it } from 'vitest'
import { canApplicantEscalate, isSlaBreached, isTerminal, SLA_BREACH_HOURS } from './escalation'

describe('isSlaBreached', () => {
  it('is false for a freshly created appeal', () => {
    const now = new Date('2026-01-04T00:00:00Z')
    const appeal = { status: 'pending', createdAt: new Date('2026-01-03T23:00:00Z') }
    expect(isSlaBreached(appeal, now)).toBe(false)
  })

  it(`is true once ${SLA_BREACH_HOURS}h have passed on an open appeal`, () => {
    const createdAt = new Date('2026-01-01T00:00:00Z')
    const now = new Date(createdAt.getTime() + SLA_BREACH_HOURS * 60 * 60 * 1000)
    expect(isSlaBreached({ status: 'in_review', createdAt }, now)).toBe(true)
  })

  it('is false for a resolved appeal no matter how old', () => {
    const createdAt = new Date('2020-01-01T00:00:00Z')
    expect(isSlaBreached({ status: 'resolved', createdAt }, new Date())).toBe(false)
  })

  it('is false for an already-escalated appeal (no double-escalation via the sweep)', () => {
    const createdAt = new Date('2020-01-01T00:00:00Z')
    expect(isSlaBreached({ status: 'escalated', createdAt }, new Date())).toBe(false)
  })
})

describe('canApplicantEscalate / isTerminal', () => {
  it.each(['pending', 'assigned', 'in_review'])('allows applicant escalation while open (%s)', (status) => {
    expect(canApplicantEscalate({ status, createdAt: new Date() })).toBe(true)
    expect(isTerminal(status)).toBe(false)
  })

  it.each(['resolved', 'rejected', 'escalated'])('refuses applicant escalation once terminal (%s)', (status) => {
    expect(canApplicantEscalate({ status, createdAt: new Date() })).toBe(false)
    expect(isTerminal(status)).toBe(true)
  })
})
