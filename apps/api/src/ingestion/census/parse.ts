import { createReadStream, readFileSync } from 'node:fs'
import { parse as parseSync } from 'csv-parse/sync'
import { parse as parseStream } from 'csv-parse'
import type { RawCensusRecord } from './types.js'

// These are large national files (shrid2_spatial_stats.csv ~160MB,
// pc11_vd_clean_shrid.csv ~683MB) — streamed and filtered to the target
// district as they're read, never loaded whole into memory.
// shrid_loc_names.csv (~43MB) is small enough to read in full; it's what
// determines which shrid2s are in scope for everything else.
const AMENITY_COLUMNS = [
  'pc11_vd_p_sch_gov_status',
  'pc11_vd_p_sch_priv_status',
  'pc11_vd_m_sch_gov_status',
  'pc11_vd_m_sch_priv_status',
  'pc11_vd_s_sch_gov_status',
  'pc11_vd_s_sch_priv_status',
  'pc11_vd_atm',
  'pc11_vd_comm_bank',
  'pc11_vd_coop_bank',
  'pc11_vd_mrkt',
  'pc11_vd_wkl_haat',
  'pc11_vd_subdistrict_hq_dist',
  'pc11_vd_district_hq_dist',
  'pc11_vd_town_dist',
  'pc11_vd_atm_dist',
] as const

interface LocNameEntry {
  villageName: string
  blockName: string
}

export interface CensusFilePaths {
  locNames: string
  spatialStats: string
  villageDirectory: string
}

async function loadDistrictShrids(locNamesPath: string, districtName: string): Promise<Map<string, LocNameEntry>> {
  const content = readFileSync(locNamesPath, 'utf8')
  const records: Record<string, string>[] = parseSync(content, { columns: true, skip_empty_lines: true, trim: true })

  // shrid_loc_names.csv covers both villages and towns under one key
  // scheme, distinguished by which of village_name/town_name is
  // populated — a blank village_name here means this shrid2 is a Census
  // *town* record, correctly out of scope for a rural pilot (see
  // CLAUDE.md target user), not a data-quality problem.
  const map = new Map<string, LocNameEntry>()
  for (const r of records) {
    if ((r.district_name ?? '').trim().toLowerCase() !== districtName.toLowerCase()) continue
    const villageName = (r.village_name ?? '').trim()
    if (!villageName) continue
    map.set(r.shrid2 ?? '', { villageName, blockName: r.subdistrict_name ?? '' })
  }
  return map
}

async function loadSpatialStats(spatialStatsPath: string, shridFilter: Set<string>): Promise<Map<string, { lat: string; lon: string }>> {
  const map = new Map<string, { lat: string; lon: string }>()
  const stream = createReadStream(spatialStatsPath).pipe(parseStream({ columns: true, skip_empty_lines: true, trim: true }))
  for await (const record of stream) {
    const row = record as Record<string, string>
    const shrid2 = row.shrid2 ?? ''
    if (!shridFilter.has(shrid2)) continue
    map.set(shrid2, { lat: row.latitude ?? '', lon: row.longitude ?? '' })
  }
  return map
}

async function loadAmenities(villageDirectoryPath: string, shridFilter: Set<string>): Promise<Map<string, Record<string, string>>> {
  const map = new Map<string, Record<string, string>>()
  const stream = createReadStream(villageDirectoryPath).pipe(parseStream({ columns: true, skip_empty_lines: true, trim: true }))
  for await (const record of stream) {
    const row = record as Record<string, string>
    const shrid2 = row.shrid2 ?? ''
    if (!shridFilter.has(shrid2)) continue
    const fields: Record<string, string> = {}
    for (const col of AMENITY_COLUMNS) fields[col] = row[col] ?? ''
    map.set(shrid2, fields)
  }
  return map
}

export async function parseCensusFiles(paths: CensusFilePaths, districtName = 'madurai'): Promise<RawCensusRecord[]> {
  const locNames = await loadDistrictShrids(paths.locNames, districtName)
  const shridSet = new Set(locNames.keys())
  const [spatial, amenities] = await Promise.all([
    loadSpatialStats(paths.spatialStats, shridSet),
    loadAmenities(paths.villageDirectory, shridSet),
  ])

  const rows: RawCensusRecord[] = []
  for (const [shrid2, loc] of locNames) {
    const sp = spatial.get(shrid2)
    rows.push({
      shrid2,
      villageName: loc.villageName,
      blockName: loc.blockName,
      latitude: sp?.lat || null,
      longitude: sp?.lon || null,
      amenityFields: amenities.get(shrid2) ?? {},
    })
  }
  return rows
}
