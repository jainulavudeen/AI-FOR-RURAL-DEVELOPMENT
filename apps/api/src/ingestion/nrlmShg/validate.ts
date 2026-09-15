import type { ParsedRow } from './parse'
import type { RowValidationError, SocialCategory, ValidShgRow } from './types'

const VALID_CATEGORIES = new Set<SocialCategory>(['sc', 'st', 'obc', 'minority', 'general', 'total'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface ValidationOutcome {
  valid: ValidShgRow[]
  rejected: RowValidationError[]
}

// Matches the shg_registry.social_category DB check constraint exactly —
// a row with a category outside that set would fail at the DB anyway;
// rejecting it here is the same rule, enforced earlier and more legibly.
export function validateRows(rows: ParsedRow[]): ValidationOutcome {
  const valid: ValidShgRow[] = []
  const rejected: RowValidationError[] = []

  for (const { rowNumber, raw } of rows) {
    const errors: string[] = []

    if (!raw.blockName.trim()) errors.push('block_name is required')

    const category = raw.socialCategory.trim().toLowerCase()
    if (!VALID_CATEGORIES.has(category as SocialCategory)) {
      errors.push(`social_category "${raw.socialCategory}" must be one of ${[...VALID_CATEGORIES].join(', ')}`)
    }

    const countRaw = raw.activeShgCount.trim()
    let activeShgCount = 0
    if (!countRaw) {
      errors.push('active_shg_count is required')
    } else {
      const parsed = Number(countRaw)
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.push(`active_shg_count "${raw.activeShgCount}" is not a valid non-negative integer`)
      } else {
        activeShgCount = parsed
      }
    }

    const dateRaw = raw.asOfDate.trim()
    if (!DATE_RE.test(dateRaw)) {
      errors.push(`as_of_date "${raw.asOfDate}" must be in YYYY-MM-DD format`)
    }

    if (errors.length > 0) {
      rejected.push({ rowNumber, raw, errors })
      continue
    }

    valid.push({
      blockName: raw.blockName.trim(),
      socialCategory: category as SocialCategory,
      activeShgCount,
      asOfDate: dateRaw,
    })
  }

  return { valid, rejected }
}
