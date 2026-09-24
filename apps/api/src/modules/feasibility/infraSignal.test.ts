import { describe, expect, it } from 'vitest'
import { blocks, villageAmenities, villages } from '../../db/schema/index.js'
import { getInfraSignal } from './infraSignal.js'

// Mimics the chained drizzle query builder, discriminating by which table
// object `.from()` was called with (reference equality against the real
// schema exports). getInfraSignal's block-then-district fallback issues
// TWO separate `.from(villages)` queries when the block resolves nothing
// (one for the block, one for the district's villages) — a fake keyed
// only on table identity can't tell them apart, so `.from(villages)`
// answers from `villageRowsByCall` in call order instead.
function makeFakeDb({
  villageRowsByCall = [[]],
  districtBlockRows = [],
  amenityRows = [],
}: {
  villageRowsByCall?: unknown[][]
  districtBlockRows?: unknown[]
  amenityRows?: unknown[]
} = {}) {
  let villagesCallCount = 0
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === villages) {
          const rows = villageRowsByCall[villagesCallCount] ?? []
          villagesCallCount += 1
          return { where: () => Promise.resolve(rows) }
        }
        if (table === blocks) return { where: () => Promise.resolve(districtBlockRows) }
        if (table === villageAmenities) return { innerJoin: () => ({ where: () => Promise.resolve(amenityRows) }) }
        throw new Error('unexpected table in fake db')
      },
    }),
  }
}

const REAL_AMENITIES = [
  { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
  { availableInVillage: true, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
  { availableInVillage: false, datasetVersionId: 'v1', vintageLabel: 'Census 2011' },
]

describe('getInfraSignal', () => {
  it('returns neutral when neither districtId nor blockId is given', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal({} as any, null, null)
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })

  it('returns neutral when nothing resolves at block or district level', async () => {
    const db = makeFakeDb()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('neutral')
  })

  it('returns a real block-level signal when the applicant\'s own block resolves', async () => {
    const db = makeFakeDb({ villageRowsByCall: [[{ id: 'village-1' }]], amenityRows: REAL_AMENITIES })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('real_block')
    expect(result.value).toBeGreaterThan(0)
    expect(result.asOf).toBe('Census 2011')
    expect(result.datasetVersionId).toBe('v1')
  })

  it('falls back to a real district-level aggregate when the block itself has no villages (mock block name mismatch)', async () => {
    // Block-level villages query returns nothing (block-1 doesn't match any
    // real ingested block), but the district resolves to real blocks whose
    // villages DO have amenity data.
    const db = makeFakeDb({
      villageRowsByCall: [[], [{ id: 'village-a' }, { id: 'village-b' }]],
      districtBlockRows: [{ id: 'real-block-a' }, { id: 'real-block-b' }],
      amenityRows: REAL_AMENITIES,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getInfraSignal(db as any, 'district-1', 'block-1')
    expect(result.label).toBe('real_district')
    expect(result.value).toBeGreaterThan(0)
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
    const result = await getInfraSignal(db as any, 'district-1', 'block-1')
    expect(result).toEqual({ value: 0, label: 'neutral', asOf: null, datasetVersionId: null })
  })
})
