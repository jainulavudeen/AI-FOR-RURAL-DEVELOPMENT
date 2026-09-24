import { describe, expect, it } from 'vitest'
import { describeSchemeChange, isMaterialSchemeChange, type SchemeRuleSnapshot } from './schemeChangeDiff.js'

const base: SchemeRuleSnapshot = { schemeId: 'micro_finance', version: 1, interestRate: 8, loanCap: 125000 }

describe('isMaterialSchemeChange', () => {
  it('is false when nothing material changed (e.g. only tenure/moratorium would differ, not modeled here)', () => {
    expect(isMaterialSchemeChange(base, { ...base, version: 2 })).toBe(false)
  })

  it('is true on a rate change', () => {
    expect(isMaterialSchemeChange(base, { ...base, version: 2, interestRate: 9 })).toBe(true)
  })

  it('is true on a loan-cap change', () => {
    expect(isMaterialSchemeChange(base, { ...base, version: 2, loanCap: 150000 })).toBe(true)
  })

  it('never fires (and does not notify on) every write — a same-values "new version" is not material', () => {
    expect(isMaterialSchemeChange(base, { ...base })).toBe(false)
  })

  it('refuses to diff two different schemes', () => {
    expect(() => isMaterialSchemeChange(base, { ...base, schemeId: 'term_loan' })).toThrow()
  })
})

describe('describeSchemeChange', () => {
  it('mentions the rate when the rate changed', () => {
    const msg = describeSchemeChange(base, { ...base, interestRate: 9 })
    expect(msg).toContain('8%')
    expect(msg).toContain('9%')
  })

  it('mentions the cap when the cap changed', () => {
    const msg = describeSchemeChange(base, { ...base, loanCap: 150000 })
    expect(msg).toContain('125000')
    expect(msg).toContain('150000')
  })

  it('mentions both when both changed', () => {
    const msg = describeSchemeChange(base, { ...base, interestRate: 9, loanCap: 150000 })
    expect(msg).toContain('interest rate')
    expect(msg).toContain('maximum loan')
  })
})
