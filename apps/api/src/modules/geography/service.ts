import type { BlockOption, DistrictOption, StateOption } from './types'

export class ValidationError extends Error {
  statusCode = 400
  code = 'BAD_REQUEST'
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface GeographyDeps {
  listStates: () => Promise<StateOption[]>
  listDistricts: (stateId: string) => Promise<DistrictOption[]>
  listBlocks: (districtUuid: string) => Promise<BlockOption[]>
}

// Real, nationwide administrative reference data (35 states, 628
// districts, ~5,900 blocks/taluks/tehsils — Census 2011 names, see
// ingestion/adminHierarchy/). Unauthenticated, same class as feasibility's
// other public GETs — this is static reference data, not personal
// information.
export async function getStates(deps: GeographyDeps): Promise<StateOption[]> {
  return deps.listStates()
}

export async function getDistricts(deps: GeographyDeps, stateId: string): Promise<DistrictOption[]> {
  if (!stateId?.trim()) throw new ValidationError('stateId is required')
  return deps.listDistricts(stateId)
}

export async function getBlocks(deps: GeographyDeps, districtUuid: string): Promise<BlockOption[]> {
  if (!districtUuid?.trim()) throw new ValidationError('districtUuid is required')
  return deps.listBlocks(districtUuid)
}
