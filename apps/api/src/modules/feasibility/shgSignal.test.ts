import { describe, expect, it } from 'vitest'
import { getShgSignal } from './shgSignal'

function makeFakeDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  }
}

describe('getShgSignal', () => {
  it('returns neutral when no blockId is given', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal({} as any, null)
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })

  it('returns neutral when shg_registry has no rows for this block — the honest, expected case today', async () => {
    // NRLM has zero rows loaded anywhere (CLAUDE.md Known Gap) — this is
    // the real-world path this signal takes for every block right now.
    const db = makeFakeDb([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'block-1')
    expect(result.label).toBe('neutral')
  })

  it('returns a real signal from the "total" row when SHG data exists', async () => {
    const db = makeFakeDb([
      { socialCategory: 'sc', activeShgCount: 5, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
      { socialCategory: 'total', activeShgCount: 20, datasetVersionId: 'v1', vintageLabel: 'NRLM 2024' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'block-1')
    expect(result.label).toBe('real')
    expect(result.value).toBe(5) // saturation=1 -> (1-0.5)*10 = 5
    expect(result.asOf).toBe('NRLM 2024')
  })

  it('never throws — degrades to neutral on a DB error', async () => {
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => {
              throw new Error('connection lost')
            },
          }),
        }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getShgSignal(db as any, 'block-1')
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })
})
