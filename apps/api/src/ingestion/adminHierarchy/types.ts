export interface StateRow {
  code: string // stable SHRUG shrid2 state-prefix, e.g. "11-09" — never shown to a user
  stateCode: string // slug, e.g. "uttar_pradesh" — the id the client already sends as selection.stateId
  stateName: string // display name, e.g. "Uttar Pradesh"
}

export interface DistrictRow {
  code: string // stable SHRUG shrid2 district-prefix, e.g. "11-09-132"
  stateCode: string
  stateName: string
  districtSlug: string // e.g. "saharanpur" — matches selection.districtId
  districtName: string // e.g. "Saharanpur"
}

export interface BlockRow {
  code: string // stable SHRUG shrid2 subdistrict-prefix, e.g. "11-09-132-00701"
  districtCode: string
  blockSlug: string // e.g. "behat" — matches selection.blockId
  blockName: string // e.g. "Behat"
}

export interface ParsedAdminHierarchy {
  states: StateRow[]
  districts: DistrictRow[]
  blocks: BlockRow[]
  rejectedCount: number
}
