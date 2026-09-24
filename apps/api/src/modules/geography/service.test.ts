import { describe, expect, it, vi } from 'vitest'
import { getBlocks, getDistricts, getStates, ValidationError, type GeographyDeps } from './service.js'

function makeDeps(overrides: Partial<GeographyDeps> = {}): GeographyDeps {
  return {
    listStates: vi.fn(async () => [{ id: 'tamil_nadu', name: 'Tamil Nadu' }]),
    listDistricts: vi.fn(async () => [{ id: 'madurai', uuid: 'district-uuid-1', name: 'Madurai' }]),
    listBlocks: vi.fn(async () => [{ id: 'melur', name: 'Melur' }]),
    ...overrides,
  }
}

describe('getStates', () => {
  it('returns every state, no arguments needed', async () => {
    const deps = makeDeps()
    await expect(getStates(deps)).resolves.toEqual([{ id: 'tamil_nadu', name: 'Tamil Nadu' }])
  })
})

describe('getDistricts', () => {
  it('requires a stateId', async () => {
    const deps = makeDeps()
    await expect(getDistricts(deps, '')).rejects.toThrow(ValidationError)
  })

  it('passes the stateId through to the query', async () => {
    const deps = makeDeps()
    await getDistricts(deps, 'tamil_nadu')
    expect(deps.listDistricts).toHaveBeenCalledWith('tamil_nadu')
  })
})

describe('getBlocks', () => {
  it('requires a districtUuid', async () => {
    const deps = makeDeps()
    await expect(getBlocks(deps, '')).rejects.toThrow(ValidationError)
  })

  it('passes the districtUuid through to the query', async () => {
    const deps = makeDeps()
    await getBlocks(deps, 'district-uuid-1')
    expect(deps.listBlocks).toHaveBeenCalledWith('district-uuid-1')
  })
})
