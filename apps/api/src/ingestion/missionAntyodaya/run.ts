import '../../config/loadEnv.js'
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { blocks, districts, gpInfrastructureIndicators, villages } from '../../db/schema/index.js'
import { recordDatasetVersion } from '../datasetVersions.js'
import { loadFacilityRows, type LoadDeps } from './load.js'
import { parseFacilityFile } from './parse.js'
import { validateRows } from './validate.js'
import type { RawFacilityRecord } from './types.js'

const DATA_DIR = new URL('../../../data/ingestion/mission-antyodaya', import.meta.url).pathname

const SOURCES = [
  { file: 'village-basic-facilities.csv', sector: 'basic_facilities' },
  { file: 'village-agriculture-report.csv', sector: 'agriculture' },
]

function parseArgs() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const dirArg = args.find((a) => a.startsWith('--dir='))
  const dir = dirArg ? dirArg.slice('--dir='.length) : DATA_DIR
  return { dir, dryRun }
}

async function main() {
  const { dir, dryRun } = parseArgs()
  const paths = SOURCES.map((s) => ({ ...s, path: `${dir}/${s.file}` }))

  const missing = paths.filter((p) => !existsSync(p.path))
  if (missing.length > 0) {
    console.error('Missing input file(s):')
    for (const m of missing) console.error(`  ${m.path}`)
    console.error('')
    console.error('Expected the Mission Antyodaya 2020 village-grain CSVs (village-basic-facilities.csv,')
    console.error('village-agriculture-report.csv) at --dir=<path> (default: apps/api/data/ingestion/mission-antyodaya).')
    process.exitCode = 1
    return
  }

  console.log('Parsing (streaming, filtered to Madurai)…')
  const allRaw: RawFacilityRecord[] = []
  for (const p of paths) {
    const rows = await parseFacilityFile(p.path, 'Madurai', p.sector)
    console.log(`  ${p.file}: ${rows.length} Madurai rows (sector: ${p.sector})`)
    allRaw.push(...rows)
  }

  const { valid, rejected } = validateRows(allRaw)
  console.log(`${allRaw.length} total rows: ${valid.length} valid, ${rejected.length} rejected`)
  for (const row of rejected) {
    console.log(`  village_code ${row.villageCode}: ${row.errors.join('; ')}`)
  }

  if (dryRun) {
    console.log('Dry run — no database writes.')
    return
  }

  if (valid.length === 0) {
    console.error('No valid rows to load.')
    process.exitCode = 1
    return
  }

  const [maduraiDistrict] = await db.select().from(districts).where(eq(districts.name, 'madurai')).limit(1)
  if (!maduraiDistrict) {
    console.error('Madurai district not found — run `npm run db:seed -w apps/api` first.')
    process.exitCode = 1
    return
  }

  const deps: LoadDeps = {
    findOrCreateBlock: async (districtId, blockName) => {
      const [row] = await db
        .insert(blocks)
        .values({ districtId, name: blockName })
        .onConflictDoUpdate({ target: [blocks.districtId, blocks.name], set: { updatedAt: new Date() } })
        .returning({ id: blocks.id })
      if (!row) throw new Error('Failed to upsert block')
      return row
    },
    findOrCreateVillage: async (blockId, villageName) => {
      const [row] = await db
        .insert(villages)
        .values({ blockId, name: villageName })
        .onConflictDoUpdate({ target: [villages.blockId, villages.name], set: { updatedAt: new Date() } })
        .returning({ id: villages.id })
      if (!row) throw new Error('Failed to upsert village')
      return row
    },
    upsertIndicator: async (input) => {
      await db
        .insert(gpInfrastructureIndicators)
        .values({
          villageId: input.villageId,
          sector: input.sector,
          indicatorName: input.indicatorName,
          indicatorValue: input.indicatorValue,
          numericValue: input.numericValue !== null ? String(input.numericValue) : null,
          surveyYear: input.surveyYear,
          datasetVersionId: input.datasetVersionId,
        })
        .onConflictDoUpdate({
          target: [
            gpInfrastructureIndicators.villageId,
            gpInfrastructureIndicators.sector,
            gpInfrastructureIndicators.indicatorName,
            gpInfrastructureIndicators.surveyYear,
          ],
          set: {
            indicatorValue: input.indicatorValue,
            numericValue: input.numericValue !== null ? String(input.numericValue) : null,
            datasetVersionId: input.datasetVersionId,
            updatedAt: new Date(),
          },
        })
    },
  }

  const datasetVersion = await recordDatasetVersion(db, {
    source: 'mission_antyodaya',
    vintageLabel: `Mission Antyodaya ${valid[0]?.surveyYear ?? ''}`.trim(),
    sourceDescription: `${dir} (village-basic-facilities.csv + village-agriculture-report.csv)`,
    fetchedAt: new Date(),
    recordCount: valid.length,
    notes: rejected.length > 0 ? `${rejected.length} rows rejected — see run log` : undefined,
  })

  const result = await loadFacilityRows(deps, maduraiDistrict.id, valid, datasetVersion.id)
  console.log(
    `Touched ${result.villagesTouched} villages, loaded ${result.indicatorsLoaded} gp_infrastructure_indicators rows under dataset_versions ${datasetVersion.id}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
