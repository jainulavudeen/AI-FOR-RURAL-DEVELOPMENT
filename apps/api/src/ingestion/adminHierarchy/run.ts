import '../../config/loadEnv'
import { existsSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { blocks, districts } from '../../db/schema'
import { recordDatasetVersion } from '../datasetVersions'
import { loadAdminHierarchy, type LoadDeps } from './load'
import { parseAdminHierarchy } from './parse'
import type { BlockRow, DistrictRow } from './types'

const DATA_DIR = new URL('../../../data/ingestion', import.meta.url).pathname
const BATCH_SIZE = 500 // keeps each INSERT's parameter count well under Postgres's limit

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string, fallback: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`))
    return arg ? arg.slice(flag.length + 1) : fallback
  }
  return {
    locNamesPath: get('--loc-names', `${DATA_DIR}/shrug-keys/shrid_loc_names.csv`),
    dryRun: args.includes('--dry-run'),
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const { locNamesPath, dryRun } = parseArgs()

  if (!existsSync(locNamesPath)) {
    console.error(`Missing input file: ${locNamesPath}`)
    console.error('')
    console.error("Expected SHRUG's redistribution of the Census 2011 administrative hierarchy —")
    console.error('devdatalab.org/shrug_download/ (shrid_loc_names.csv) — or pass --loc-names=<path>.')
    process.exitCode = 1
    return
  }

  console.log('Parsing (nationwide — every state, district, and subdistrict/block in the file)…')
  const parsed = parseAdminHierarchy(locNamesPath)
  console.log(
    `${parsed.states.length} states, ${parsed.districts.length} districts, ${parsed.blocks.length} blocks found (${parsed.rejectedCount} rows rejected — missing name or malformed code)`
  )

  if (dryRun) {
    console.log('Dry run — no database writes.')
    console.log('Sample states:', parsed.states.slice(0, 5).map((s) => s.stateName).join(', '))
    return
  }

  const datasetVersion = await recordDatasetVersion(db, {
    source: 'census_2011_admin_hierarchy',
    vintageLabel: 'Census 2011',
    sourceDescription: `SHRUG redistribution (nationwide state/district/subdistrict names): ${locNamesPath}`,
    fetchedAt: new Date(),
    recordCount: parsed.districts.length + parsed.blocks.length,
  })
  console.log(`Recorded dataset_versions ${datasetVersion.id}`)

  const deps: LoadDeps = {
    upsertDistricts: async (rows: DistrictRow[]) => {
      const idByCode = new Map<string, string>()
      for (const batch of chunk(rows, BATCH_SIZE)) {
        // Conflict target is (stateCode, name) — the constraint every
        // district row satisfies, old and new alike — not `code`, which
        // pre-existing rows (the seeded Madurai pilot district, inserted
        // before this migration added the column) don't have yet. This
        // both backfills `code` onto those rows and stays idempotent for
        // a re-run of this script, in one pass.
        const inserted = await db
          .insert(districts)
          .values(
            batch.map((r) => ({
              code: r.code,
              stateCode: r.stateCode,
              stateName: r.stateName,
              name: r.districtSlug,
            }))
          )
          .onConflictDoUpdate({
            target: [districts.stateCode, districts.name],
            // `districts.code` here would self-reference the row already
            // in the table (a no-op) — found live: every pre-existing
            // district (Madurai) kept code = null through a full ingest
            // run despite this "update". Postgres's own ON CONFLICT
            // syntax needs `excluded.<col>` to mean "the value this
            // INSERT proposed," which drizzle only expresses via a raw
            // sql fragment, not the column reference.
            set: { code: sql`excluded.code`, stateName: sql`excluded.state_name`, updatedAt: new Date() },
          })
          .returning({ id: districts.id, code: districts.code })
        for (const row of inserted) if (row.code) idByCode.set(row.code, row.id)
      }

      return idByCode
    },
    upsertBlocks: async (rows: Array<BlockRow & { districtId: string }>) => {
      for (const batch of chunk(rows, BATCH_SIZE)) {
        // Same reasoning as districts above — conflict on (districtId,
        // name), not `code`. Bonus: Madurai's blocks already exist from
        // the earlier real Census village-directory ingestion (Melur,
        // Thirumangalam, ...) with the same slug names but no code — this
        // merges into those exact rows and backfills their code, rather
        // than creating duplicates alongside them.
        await db
          .insert(blocks)
          .values(batch.map((r) => ({ code: r.code, districtId: r.districtId, name: r.blockSlug })))
          .onConflictDoUpdate({
            target: [blocks.districtId, blocks.name],
            set: { code: sql`excluded.code`, updatedAt: new Date() },
          })
      }
    },
  }

  const result = await loadAdminHierarchy(deps, parsed)
  console.log(
    `Loaded ${result.districtsLoaded} districts and ${result.blocksLoaded} blocks nationwide` +
      (result.blocksSkippedNoDistrict > 0 ? ` (${result.blocksSkippedNoDistrict} blocks skipped — no matching district)` : '')
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    // The db client (postgres.js) and its connection pool keep the event
    // loop alive indefinitely otherwise — found live this session with
    // ingestion/census/run.ts, which has this same gap: it finishes all
    // its real work in well under a minute but then hangs forever with no
    // further output, needing a manual kill. Not fixed there (out of
    // scope), but not repeated here.
    process.exit(process.exitCode ?? 0)
  })
