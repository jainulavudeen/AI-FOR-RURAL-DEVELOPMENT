import { describe, expect, it } from 'vitest'
import type { ParsedRow } from './parse'
import { validateRows } from './validate'

function row(overrides: Partial<ParsedRow['raw']>): ParsedRow {
  return {
    rowNumber: 2,
    raw: {
      blockName: 'Madurai North',
      socialCategory: 'sc',
      activeShgCount: '42',
      asOfDate: '2024-03-31',
      ...overrides,
    },
  }
}

describe('validateRows (NRLM SHG)', () => {
  it('accepts a well-formed row', () => {
    const { valid, rejected } = validateRows([row({})])
    expect(rejected).toHaveLength(0)
    expect(valid[0]).toEqual({ blockName: 'Madurai North', socialCategory: 'sc', activeShgCount: 42, asOfDate: '2024-03-31' })
  })

  it('rejects a social_category outside the DB check constraint set', () => {
    const { valid, rejected } = validateRows([row({ socialCategory: 'bpl' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors.some((e) => e.includes('social_category'))).toBe(true)
  })

  it('rejects a negative SHG count instead of coercing it', () => {
    const { valid, rejected } = validateRows([row({ activeShgCount: '-3' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors.some((e) => e.includes('active_shg_count'))).toBe(true)
  })

  it('rejects a malformed date', () => {
    const { valid, rejected } = validateRows([row({ asOfDate: '31/03/2024' })])
    expect(valid).toHaveLength(0)
    expect(rejected[0]?.errors.some((e) => e.includes('as_of_date'))).toBe(true)
  })
})
