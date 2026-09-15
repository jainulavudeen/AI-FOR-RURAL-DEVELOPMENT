import { createReadStream } from 'node:fs'
import { parse as parseStream } from 'csv-parse'
import type { RawFacilityRecord } from './types'

// Both source files share this key-column shape; everything else in the
// header is an indicator column, whatever it's named — not a hardcoded
// list, so this doesn't silently drop a column if the real file's headers
// shift slightly between survey rounds.
const KEY_COLUMNS = new Set([
  'id',
  'year',
  'state_code',
  'state_name',
  'district_code',
  'district_name',
  'block_code',
  'block_name',
  'gp_code',
  'gp_name',
  'village_code',
  'village_name',
])

export async function parseFacilityFile(filePath: string, districtName: string, sector: string): Promise<RawFacilityRecord[]> {
  const rows: RawFacilityRecord[] = []
  const stream = createReadStream(filePath).pipe(parseStream({ columns: true, skip_empty_lines: true, trim: true }))

  for await (const record of stream) {
    const row = record as Record<string, string>
    if ((row.district_name ?? '').trim().toLowerCase() !== districtName.toLowerCase()) continue

    const indicatorFields: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      if (!KEY_COLUMNS.has(key)) indicatorFields[key] = value
    }

    rows.push({
      villageName: (row.village_name ?? '').trim(),
      blockName: (row.block_name ?? '').trim(),
      villageCode: (row.village_code ?? '').trim(),
      sector,
      surveyYear: (row.year ?? '').trim(),
      indicatorFields,
    })
  }

  return rows
}
