import { readFileSync } from 'node:fs'
import { parse } from 'csv-parse/sync'
import type { RawShgRow } from './types'

export interface ParsedRow {
  rowNumber: number
  raw: RawShgRow
}

// Expects headers: block_name,social_category,active_shg_count,as_of_date
export function parseShgFile(filePath: string): ParsedRow[] {
  const content = readFileSync(filePath, 'utf8')
  const records: Record<string, string>[] = parse(content, { columns: true, skip_empty_lines: true, trim: true })

  return records.map((record, index) => ({
    rowNumber: index + 2,
    raw: {
      blockName: record.block_name ?? '',
      socialCategory: record.social_category ?? '',
      activeShgCount: record.active_shg_count ?? '',
      asOfDate: record.as_of_date ?? '',
    },
  }))
}
