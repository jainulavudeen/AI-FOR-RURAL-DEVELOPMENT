import type { RawFacilityRecord, RowValidationError, ValidFacilityRow } from './types'

export interface ValidationOutcome {
  valid: ValidFacilityRow[]
  rejected: RowValidationError[]
}

// Every indicator column is loaded as its raw value (BOOL "t"/"f" or a
// TEXT category, per the codebook) plus a best-effort numeric parse —
// never coerced into a guessed type. Only a row missing its identity
// (name/code) is rejected; a blank indicator value is real non-response,
// loaded as-is, not an error.
export function validateRows(rows: RawFacilityRecord[]): ValidationOutcome {
  const valid: ValidFacilityRow[] = []
  const rejected: RowValidationError[] = []

  for (const row of rows) {
    const errors: string[] = []
    if (!row.villageCode) errors.push('village_code is required')
    if (!row.villageName) errors.push('village_name is required')
    if (!row.blockName) errors.push('block_name is required')

    const surveyYear = Number(row.surveyYear)
    if (!Number.isInteger(surveyYear) || surveyYear < 2000 || surveyYear > 2100) {
      errors.push(`year "${row.surveyYear}" is not a valid year`)
    }

    if (errors.length > 0) {
      rejected.push({ villageCode: row.villageCode || '(missing)', errors })
      continue
    }

    const indicators = Object.entries(row.indicatorFields).map(([indicatorName, indicatorValue]) => {
      const numeric = Number(indicatorValue)
      return {
        indicatorName,
        indicatorValue,
        numericValue: indicatorValue !== '' && Number.isFinite(numeric) ? numeric : null,
      }
    })

    valid.push({
      villageName: row.villageName,
      blockName: row.blockName,
      villageCode: row.villageCode,
      sector: row.sector,
      surveyYear,
      indicators,
    })
  }

  return { valid, rejected }
}
