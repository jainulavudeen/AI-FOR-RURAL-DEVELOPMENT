// Real shape, verified against actual Madurai rows and the official
// codebooks (apps/api/data/ingestion/mission-antyodaya/codebooks/) before
// this was written. Two village-grain files: village-basic-facilities.csv
// (BOOL/TEXT indicators) and village-agriculture-report.csv (agriculture
// sector). Keyed by the state's own village_code — a different coding
// scheme from SHRUG's shrid2 (see CLAUDE.md) — so villages are matched to
// what the Census loader already created by (block name, village name).
export interface RawFacilityRecord {
  villageName: string
  blockName: string
  villageCode: string
  sector: string
  surveyYear: string
  indicatorFields: Record<string, string>
}

export interface Indicator {
  indicatorName: string
  indicatorValue: string
  numericValue: number | null
}

export interface ValidFacilityRow {
  villageName: string
  blockName: string
  villageCode: string
  sector: string
  surveyYear: number
  indicators: Indicator[]
}

export interface RowValidationError {
  villageCode: string
  errors: string[]
}
