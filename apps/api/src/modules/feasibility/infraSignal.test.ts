import { describe, expect, it } from 'vitest'
import { getInfraSignal } from './infraSignal'

// Mimics the chained drizzle query builder — same inline-fake-db technique
// as service.test.ts's getInformalLendingRate tests. `.from()`'s result
// branches on which method is called next: `.where()` directly resolves the
// villages query, `.innerJoin().where()` resolves the joined amenities query.
function makeFakeDb(villageRows: unknown[], amenityRows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(villageRows),
        innerJoin: () => ({
          where: () => Promise.resolve(amenityRows),
        }),
      }),
    }),
  }
}

describe('getInfraSignal', () => {
  it('returns neutral when no blockId is given', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal({} as any, null)
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })

  it('returns neutral when the block has no villages', async () => {
    const db = makeFakeDb([], [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal(db as any, 'block-1')
    expect(result.label).toBe('neutral')
  })

  it('returns a real, positive-leaning signal when most amenities are available', async () => {
    const db = makeFakeDb(
      [{ id: 'village-1' }],
      [
        { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
        { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
        { availableInVillage: false, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
      ]
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal(db as any, 'block-1')
    expect(result.label).toBe('real')
    expect(result.value).toBeGreaterThan(0)
    expect(result.asOf).toBe('Census 2011')
    expect(result.datasetVersionId).toBe('v1')
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
    const result = await getInfraSignal(db as any, 'block-1')
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })
})
