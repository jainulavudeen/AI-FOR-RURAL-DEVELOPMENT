import { describe, expect, it } from 'vitest'
import { buildAllowedNumbers, extractNumericTokens, validateNarration } from './validator.js'

describe('extractNumericTokens', () => {
  it('extracts ₹ figures, comma-grouped and plain, percents, and decimals', () => {
    expect(extractNumericTokens('Loan of ₹1,25,000 at 6.5% for 3 years, EMI ₹3805.50')).toEqual([
      125000, 6.5, 3, 3805.5,
    ])
  })
})

describe('validateNarration — the number-inventing mock model must be caught', () => {
  it('rejects a narration that invents a number never given to it', () => {
    const allowed = buildAllowedNumbers({ loanAmount: 125000, emi: 3805, score: 78 })
    // A deliberately number-inventing "model": states a loan figure that
    // was never in the structured input.
    const inventedNarration = 'Based on your profile, we suggest a loan of ₹2,00,000 with an EMI of ₹3805.'
    const result = validateNarration(inventedNarration, allowed)
    expect(result.valid).toBe(false)
    expect(result.invalid).toContain(200000)
  })

  it('accepts a narration that only reproduces given numbers, reformatted', () => {
    const allowed = buildAllowedNumbers({ loanAmount: 125000, emi: 3805, score: 78 }, [10, -3])
    const faithfulNarration = 'Your score is 78. The loan amount is ₹1,25,000 with an EMI of ₹3,805.'
    const result = validateNarration(faithfulNarration, allowed)
    expect(result.valid).toBe(true)
    expect(result.invalid).toEqual([])
  })

  it('tolerates small rounding differences (epsilon)', () => {
    const allowed = buildAllowedNumbers({ emi: 3805.4 })
    const result = validateNarration('Your EMI is approximately ₹3805.', allowed)
    expect(result.valid).toBe(true)
  })

  it('accepts a negative factor value even though the regex cannot capture the minus sign', () => {
    // Score factors legitimately range roughly -7..7 (demand/infra/market).
    // extractNumericTokens can't see the sign in prose ("-4" -> token 4), so
    // this must match against the negative allowed number via its magnitude.
    const allowed = buildAllowedNumbers({ score: 74 }, [-4, -6])
    const result = validateNarration('The demand factor is -4 and infrastructure is -6.', allowed)
    expect(result.valid).toBe(true)
  })

  it('rejects when the model rounds an amount into a different figure entirely', () => {
    const allowed = buildAllowedNumbers({ loanAmount: 125000 })
    const result = validateNarration('Your loan amount is ₹1,30,000.', allowed)
    expect(result.valid).toBe(false)
    expect(result.invalid).toEqual([130000])
  })
})
