import { describe, expect, it } from 'vitest'
import { blocks, shgRegistry } from '../../db/schema'
import { getShgSignal } from './shgSignal'

// Discriminates by table reference (same technique as infraSignal.test.ts).
// getShgSignal's block-then-district fallback can issue TWO separate
// `.from(shgRegistry)` queries (one for the applicant's own block, one for
// every block in the district) — answered from `shgRowsByCall` in call
// order, same reasoning as infraSignal.test.ts's villageRowsByCall.
function makeFakeDb({
  districtBlockRows = [],
  shgRowsByCall = [[]],
}: {
  districtBlockRows?: unknown[]
  shgRowsByCall?: unknown[][]
} = {}) {
  let shgCallCount = 0
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === blocks) return { where: () => Promise.resolve(districtBlockRows) }
        if (table === shgRegistry) {
          const rows = shgRowsByCall[shgCallCount] ?? []
          shgCallCount += 1
          return { innerJoin: () => ({ where: () => Promise.resolve(rows) }) }
        }
        throw new Error('unexpected table in fake db')
      },
    }),
  }
}

describe('getShgSignal', () => {
  it('returns neutral when neither districtId nor blockId is given', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal({} as any, null, null)
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })

  it('returns neutral when shg_registry has no rows at block or district level — the honest, expected case today', async () => {
    // NRLM has zero rows loaded anywhere (CLAUDE.md Known Gap) — this is
    // the real-world path this signal takes for every block right now.
    const db = makeFakeDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('neutral')
  })

  it('returns a real block-level signal from the "total" row when SHG data exists for the applicant\'s own block', async () => {
    const db = makeFakeDb({
      shgRowsByCall: [
        [
          { blockId: 'block-1', socialCategory: 'sc', activeShgCount: 5, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
          { blockId: 'block-1', socialCategory: 'total', activeShgCount: 20, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
        ],
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('real_block')
    expect(result.value).toBe(5) // saturation=1 -> (1-0.5)*10 = 5
    expect(result.asOf).toBe('NRLM 2024')
  })

  it('falls back to a real district-level aggregate (summed across every block in the district) when the block itself has none', async () => {
    const db = makeFakeDb({
      districtBlockRows: [{ id: 'real-block-a' }, { id: 'real-block-b' }],
      shgRowsByCall: [
        [], // block-level query for 'block-1' — no match
        [
          { blockId: 'real-block-a', socialCategory: 'total', activeShgCount: 10, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
          { blockId: 'real-block-b', socialCategory: 'total', activeShgCount: 10, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
        ],
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('real_district')
    expect(result.value).toBe(5) // 10+10=20 active -> saturation=1 -> 5
  })

  it('never throws — degrades to neutral on a DB error', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            throw new Error('connection lost')
          },
        }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'district-1', 'block-1')
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })
})
