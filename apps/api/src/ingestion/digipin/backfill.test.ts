import { describe, expect, it } from 'vitest'
import { backfillDigipins } from './backfill'

describe('backfillDigipins', () => {
  it('computes and writes a digipin for every candidate village', async () => {
    const written: Array<{ id: string; digipin: string }> = []
    const result = await backfillDigipins({
      findVillagesNeedingDigipin: async () => [
        { id: 'v1', lat: 9.9252, lon: 78.1198 },
        { id: 'v2', lat: 9.93, lon: 78.12 },
      ],
      updateVillageDigipin: async (villageId, digipin) => {
        written.push({ id: villageId, digipin })
      },
    })

    expect(result.updated).toBe(2)
    expect(result.failed).toHaveLength(0)
    expect(written).toHaveLength(2)
    expect(written[0]?.digipin).toMatch(/^[23456789CJKLMPFT]{10}$/)
  })

  it('returns zero updates when there are no candidates yet', async () => {
    const result = await backfillDigipins({
      findVillagesNeedingDigipin: async () => [],
      updateVillageDigipin: async () => {},
    })
    expect(result.updated).toBe(0)
    expect(result.failed).toHaveLength(0)
  })

  it('reports a failure for an out-of-bounds coordinate without throwing the whole batch', async () => {
    const written: string[] = []
    const result = await backfillDigipins({
      findVillagesNeedingDigipin: async () => [
        { id: 'bad', lat: 90, lon: 78.12 }, // out of DIGIPIN bounds
        { id: 'good', lat: 9.9252, lon: 78.1198 },
      ],
      updateVillageDigipin: async (villageId) => {
        written.push(villageId)
      },
    })

    expect(result.updated).toBe(1)
    expect(result.failed).toEqual([expect.objectContaining({ id: 'bad' })])
    expect(written).toEqual(['good'])
  })
})
