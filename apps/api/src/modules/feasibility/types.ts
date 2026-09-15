export interface ScoreRequestBody {
  businessId: string
  stateId: string
  districtId: string
  blockId: string
  locale?: 'en' | 'hi' | 'ta'
}

// Shared shape for every real, data-backed factor (Agmarknet demand, Census
// infra, NRLM SHG density): 'real' when ingested data actually resolved for
// this district/block, 'neutral' when it honestly didn't (no data loaded
// yet, or the block name didn't match — see CLAUDE.md's naming-scheme gap)
// — never an error. `asOf`/`datasetVersionId` carry provenance so the
// factor-by-factor breakdown stays sourced, per CLAUDE.md rule 3.
export interface DataBackedFactor {
  value: number
  label: 'real' | 'neutral'
  asOf: string | null
  datasetVersionId: string | null
}
