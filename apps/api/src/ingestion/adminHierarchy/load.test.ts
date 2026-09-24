import { describe, expect, it, vi } from 'vitest'
import { loadAdminHierarchy, type LoadDeps } from './load.js'
import type { DistrictRow, ParsedAdminHierarchy } from './types.js'

const sample: ParsedAdminHierarchy = {
  states: [{ code: '11-09', stateCode: 'uttar_pradesh', stateName: 'Uttar Pradesh' }],
  districts: [
    { code: '11-09-132', stateCode: 'uttar_pradesh', stateName: 'Uttar Pradesh', districtSlug: 'saharanpur', districtName: 'Saharanpur' },
  ],
  blocks: [
    { code: '11-09-132-00701', districtCode: '11-09-132', blockSlug: 'behat', blockName: 'Behat' },
    { code: '11-09-132-00702', districtCode: '11-09-132', blockSlug: 'nakur', blockName: 'Nakur' },
  ],
  rejectedCount: 0,
}

function makeDeps(overrides: Partial<LoadDeps> = {}): LoadDeps {
  return {
    upsertDistricts: vi.fn(async (rows: DistrictRow[]) => new Map(rows.map((r) => [r.code, `district-uuid-${r.code}`]))),
    upsertBlocks: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('loadAdminHierarchy', () => {
  it('resolves each block to its real district UUID before upserting', async () => {
    const deps = makeDeps()

    await loadAdminHierarchy(deps, sample)

    expect(deps.upsertBlocks).toHaveBeenCalledWith([
      { code: '11-09-132-00701', districtCode: '11-09-132', blockSlug: 'behat', blockName: 'Behat', districtId: 'district-uuid-11-09-132' },
      { code: '11-09-132-00702', districtCode: '11-09-132', blockSlug: 'nakur', blockName: 'Nakur', districtId: 'district-uuid-11-09-132' },
    ])
  })

  it('skips (and counts, never silently drops) a block whose district failed to upsert', async () => {
    const deps = makeDeps({ upsertDistricts: vi.fn(async () => new Map()) }) // no districts resolved at all

    const result = await loadAdminHierarchy(deps, sample)

    expect(result.blocksSkippedNoDistrict).toBe(2)
    expect(result.blocksLoaded).toBe(0)
    expect(deps.upsertBlocks).toHaveBeenCalledWith([])
  })

  it('reports accurate counts', async () => {
    const deps = makeDeps()
    const result = await loadAdminHierarchy(deps, sample)

    expect(result.districtsLoaded).toBe(1)
    expect(result.blocksLoaded).toBe(2)
    expect(result.blocksSkippedNoDistrict).toBe(0)
  })
})
