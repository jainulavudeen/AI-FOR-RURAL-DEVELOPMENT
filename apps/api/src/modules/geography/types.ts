// Slug-shaped ids (stateId/districtId), never a bare UUID — matching
// apps/web's existing selection.stateId/districtId/blockId contract
// exactly (see db/seed.ts's pre-existing 'tamil_nadu'/'madurai' rows,
// which nationwide ingestion follows, not a new convention). `uuid` is
// additionally exposed on districts/blocks so the frontend's cascading
// picker can query the next level unambiguously — a slug is only unique
// within its parent (a district slug within one state, a block slug
// within one district), the real DB id never is.
export interface StateOption {
  id: string
  name: string
}

export interface DistrictOption {
  id: string
  uuid: string
  name: string
}

export interface BlockOption {
  id: string
  name: string
}
