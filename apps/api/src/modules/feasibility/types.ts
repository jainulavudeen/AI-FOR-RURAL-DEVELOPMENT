export interface ScoreRequestBody {
  businessId: string
  stateId: string
  districtId: string
  blockId: string
  locale?: 'en' | 'hi' | 'ta'
}

// Shared shape for every real, data-backed factor (Agmarknet demand, Census
// infra, NRLM SHG density). 'real_block' when ingested data resolved at the
// applicant's actual block; 'real_district' when only the wider district
// resolved (the mock catalogue's block names — 'Block 1', 'Block 2' — don't
// match the real Census/Mission Antyodaya block names ingested under a
// district, so per-block precision isn't reachable through the app yet,
// but a real district-wide aggregate is still real, sourced data, honestly
// labelled as district- not block-grain); 'neutral' when nothing resolved
// at all (no data loaded yet, or an unresolvable district) — never an
// error. `asOf`/`datasetVersionId` carry provenance so the factor-by-factor
// breakdown stays sourced, per CLAUDE.md rule 3.
export interface DataBackedFactor {
  value: number
  label: 'real_block' | 'real_district' | 'neutral'
  asOf: string | null
  datasetVersionId: string | null
}
