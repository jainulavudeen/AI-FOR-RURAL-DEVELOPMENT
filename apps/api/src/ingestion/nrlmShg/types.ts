// No confirmed source exists for this data — nrlm.gov.in serves the wrong
// SSL certificate entirely (a live infrastructure failure, not a
// fetch-tool limitation), and no working Tamil Nadu alternative surfaced
// (see CLAUDE.md). Block grain, matching what search evidence suggested
// about the source's actual reporting granularity — not verified against
// a real file.
export interface RawShgRow {
  blockName: string
  socialCategory: string
  activeShgCount: string
  asOfDate: string
}

export type SocialCategory = 'sc' | 'st' | 'obc' | 'minority' | 'general' | 'total'

export interface ValidShgRow {
  blockName: string
  socialCategory: SocialCategory
  activeShgCount: number
  asOfDate: string // YYYY-MM-DD
}

export interface RowValidationError {
  rowNumber: number
  raw: RawShgRow
  errors: string[]
}
