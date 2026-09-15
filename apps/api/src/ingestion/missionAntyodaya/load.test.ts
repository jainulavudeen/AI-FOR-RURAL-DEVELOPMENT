import { describe, expect, it } from 'vitest'
import { loadFacilityRows, type LoadDeps } from './load'
import type { ValidFacilityRow } from './types'

function makeFakeDb() {
  const blocksByName = new Map<string, string>()
  const villagesByKey = new Map<string, string>()
  const indicatorsByKey = new Map<string, { indicatorValue: string; datasetVersionId: string }>()
  let nextId = 1

  const deps: LoadDeps = {
    findOrCreateBlock: async (districtId, blockName) => {
      const key = `${districtId}|${blockName}`
      let id = blocksByName.get(key)
      if (!id) {
        id = `block-${nextId++}`
        blocksByName.set(key, id)
      }
      return { id }
    },
    findOrCreateVillage: async (blockId, villageName) => {
      const key = `${blockId}|${villageName}`
      let id = villagesByKey.get(key)
      if (!id) {
        id = `village-${nextId++}`
        villagesByKey.set(key, id)
      }
      return { id }
    },
    upsertIndicator: async (input) => {
      const key = `${input.villageId}|${input.sector}|${input.indicatorName}|${input.surveyYear}`
      indicatorsByKey.set(key, { indicatorValue: input.indicatorValue, datasetVersionId: input.datasetVersionId })
    },
  }

  return { deps, blocksByName, villagesByKey, indicatorsByKey }
}

const ROWS: ValidFacilityRow[] = [
  {
    villageName: 'Sambakulam',
    blockName: 'Alanganallur',
    villageCode: '640760',
    sector: 'basic_facilities',
    surveyYear: 2020,
    indicators: [
      { indicatorName: 'banks', indicatorValue: 'f', numericValue: null },
      { indicatorName: 'primary_school', indicatorValue: 't', numericValue: null },
    ],
  },
]

describe('loadFacilityRows', () => {
  it('loads each indicator once', async () => {
    const { deps, indicatorsByKey } = makeFakeDb()
    const result = await loadFacilityRows(deps, 'district-1', ROWS, 'version-1')
    expect(result.villagesTouched).toBe(1)
    expect(result.indicatorsLoaded).toBe(2)
    expect(indicatorsByKey.size).toBe(2)
  })

  it('running the load twice with identical input does not duplicate rows', async () => {
    const { deps, blocksByName, villagesByKey, indicatorsByKey } = makeFakeDb()

    await loadFacilityRows(deps, 'district-1', ROWS, 'version-1')
    await loadFacilityRows(deps, 'district-1', ROWS, 'version-2')

    expect(blocksByName.size).toBe(1)
    expect(villagesByKey.size).toBe(1)
    expect(indicatorsByKey.size).toBe(2)

    for (const indicator of indicatorsByKey.values()) {
      expect(indicator.datasetVersionId).toBe('version-2')
    }
  })
})
