import { readFileSync } from 'node:fs'
import { parse as parseSync } from 'csv-parse/sync'
import { slugify, titleCase } from './slug.js'
import type { BlockRow, DistrictRow, ParsedAdminHierarchy, StateRow } from './types.js'

// shrid_loc_names.csv is SHRUG's (devdatalab.org/shrug_download) real
// redistribution of India's Census 2011 administrative hierarchy —
// state/district/subdistrict/village names, keyed by a hierarchical
// shrid2 code ("11-09-132-00701-..."). Small enough (~43MB, ~596K rows)
// to parse synchronously, same approach ingestion/census/parse.ts already
// uses for this exact file. This module only needs the state/district/
// subdistrict levels — not village/town, which census/ already ingests
// separately (Madurai-only today) — so it's a much lighter pass: one
// (state, district, subdistrict) row per unique shrid2 prefix, not one
// per village.
interface RawLocNameRow {
  shrid2: string
  state_name: string
  district_name: string
  subdistrict_name: string
}

// A hierarchical code prefix is a stable, government-derived join key —
// not an official LGD code (lgdirectory.gov.in was unreachable, same as
// every other CLAUDE.md Known Gap government portal this session), but a
// real Census 2011 code all the same, verified live against this exact
// file: 0 collisions where two different (state, district) pairs shared a
// district-level code prefix, out of 631 districts.
function codePrefix(shrid2: string, depth: number): string | null {
  const parts = shrid2.split('-')
  if (parts.length !== 5) return null
  return parts.slice(0, depth).join('-')
}

export function parseAdminHierarchy(locNamesPath: string): ParsedAdminHierarchy {
  const content = readFileSync(locNamesPath, 'utf8')
  const rows = parseSync(content, { columns: true, skip_empty_lines: true }) as RawLocNameRow[]

  const statesByCode = new Map<string, StateRow>()
  const districtsByCode = new Map<string, DistrictRow>()
  const blocksByCode = new Map<string, BlockRow>()
  // Tracks slugs already used within one district — two real subdistrict
  // names can slugify identically (verified live: 2 cases out of 5,913,
  // near-duplicate source names) and must not silently collapse into one
  // block or crash the unique-constraint upsert.
  const usedBlockSlugsByDistrict = new Map<string, Set<string>>()
  let rejectedCount = 0

  for (const row of rows) {
    const stateName = row.state_name?.trim()
    const districtName = row.district_name?.trim()
    const subdistrictName = row.subdistrict_name?.trim()
    const stateCode = codePrefix(row.shrid2, 2)
    const districtCode = codePrefix(row.shrid2, 3)
    const blockCode = codePrefix(row.shrid2, 4)

    if (!stateCode || !districtCode || !blockCode || !stateName || !districtName || !subdistrictName) {
      rejectedCount += 1
      continue
    }

    const stateSlug = slugify(stateName)
    const districtSlug = slugify(districtName)

    if (!statesByCode.has(stateCode)) {
      statesByCode.set(stateCode, { code: stateCode, stateCode: stateSlug, stateName: titleCase(stateName) })
    }
    if (!districtsByCode.has(districtCode)) {
      districtsByCode.set(districtCode, {
        code: districtCode,
        stateCode: stateSlug,
        stateName: titleCase(stateName),
        districtSlug,
        districtName: titleCase(districtName),
      })
    }
    if (!blocksByCode.has(blockCode)) {
      const used = usedBlockSlugsByDistrict.get(districtCode) ?? new Set<string>()
      let blockSlug = slugify(subdistrictName)
      let suffix = 2
      while (used.has(blockSlug)) {
        blockSlug = `${slugify(subdistrictName)}_${suffix}`
        suffix += 1
      }
      used.add(blockSlug)
      usedBlockSlugsByDistrict.set(districtCode, used)

      blocksByCode.set(blockCode, {
        code: blockCode,
        districtCode,
        blockSlug,
        blockName: titleCase(subdistrictName),
      })
    }
  }

  return {
    states: [...statesByCode.values()],
    districts: [...districtsByCode.values()],
    blocks: [...blocksByCode.values()],
    rejectedCount,
  }
}
