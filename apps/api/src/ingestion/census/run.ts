import '../../config/loadEnv.js'
import { existsSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { blocks, districts, villageAmenities, villages } from '../../db/schema/index.js'
import { backfillDigipins } from '../digipin/backfill.js'
import { recordDatasetVersion } from '../datasetVersions.js'
import { loadCensusRows, type LoadDeps } from './load.js'
import { parseCensusFiles, type CensusFilePaths } from './parse.js'
import { validateRows } from './validate.js'

const DATA_DIR = new URL('../../../data/ingestion', import.meta.url).pathname

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string, fallback: string) => {
    const arg = args.find((a) => a.startsWith(`${flag}=`))
    return arg ? arg.slice(flag.length + 1) : fallback
  }
  return {
    paths: {
      locNames: get('--loc-names', `${DATA_DIR}/shrug-keys/shrid_loc_names.csv`),
      spatialStats: get('--spatial-stats', `${DATA_DIR}/shrug-keys/shrid2_spatial_stats.csv`),
      villageDirectory: get('--village-directory', `${DATA_DIR}/census/pc11_vd_clean_shrid.csv`),
    } satisfies CensusFilePaths,
    dryRun: args.includes('--dry-run'),
  }
}

async function main() {
  const { paths, dryRun } = parseArgs()

  const missing = Object.entries(paths).filter(([, p]) => !existsSync(p))
  if (missing.length > 0) {
    console.error('Missing input file(s):')
    for (const [key, p] of missing) console.error(`  --${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}=${p}`)
    console.error('')
    console.error('Expected SHRUG\'s redistribution of Census 2011 Village Directory data —')
    console.error('devdatalab.org/shrug_download/ (shrid_loc_names.csv, shrid2_spatial_stats.csv,')
    console.error('pc11_vd_clean_shrid.csv) — or pass explicit paths with the flags above.')
    process.exitCode = 1
    return
  }

  console.log('Parsing (streaming, filtered to Madurai)…')
  const raw = await parseCensusFiles(paths, 'madurai')
  const { valid, rejected } = validateRows(raw)

  console.log(`${raw.length} Madurai villages found: ${valid.length} valid, ${rejected.length} rejected`)
  for (const row of rejected) {
    console.log(`  shrid ${row.shrid2}: ${row.errors.join('; ')}`)
  }
  const withCoords = valid.filter((v) => v.latitude !== null && v.longitude !== null).length
  console.log(`${withCoords}/${valid.length} villages have real coordinates (from shrid2_spatial_stats.csv)`)

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
    upsertVillageWithGeom: async ({ blockId, villageName, latitude, longitude }) => {
      // PostGIS convention: ST_MakePoint(x, y) = (longitude, latitude).
      const geomExpr = latitude !== null && longitude !== null ? sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)` : sql`NULL`
      const [row] = await db
        .insert(villages)
        .values({ blockId, name: villageName, geom: geomExpr })
        .onConflictDoUpdate({ target: [villages.blockId, villages.name], set: { geom: geomExpr, updatedAt: new Date() } })
        .returning({ id: villages.id })
      if (!row) throw new Error('Failed to upsert village')
      return row
    },
    upsertAmenity: async (input) => {
      const distanceKmStr = input.distanceKm !== null ? String(input.distanceKm) : null
      await db
        .insert(villageAmenities)
        .values({
          villageId: input.villageId,
          facilityType: input.facilityType,
          distanceKm: distanceKmStr,
          availableInVillage: input.availableInVillage,
          datasetVersionId: input.datasetVersionId,
        })
        .onConflictDoUpdate({
          target: [villageAmenities.villageId, villageAmenities.facilityType],
          set: {
            distanceKm: distanceKmStr,
            availableInVillage: input.availableInVillage,
            datasetVersionId: input.datasetVersionId,
            updatedAt: new Date(),
          },
        })
    },
  }

  const datasetVersion = await recordDatasetVersion(db, {
    source: 'census_2011_village_directory',
    vintageLabel: 'Census 2011',
    sourceDescription: `SHRUG redistribution: ${paths.villageDirectory}`,
    fetchedAt: new Date(),
    recordCount: valid.length,
    notes: rejected.length > 0 ? `${rejected.length} rows rejected — see run log` : undefined,
  })

  const result = await loadCensusRows(deps, maduraiDistrict.id, valid, datasetVersion.id)
  console.log(
    `Loaded ${result.villagesLoaded} villages (${result.villagesWithCoordinates} with coordinates) and ${result.amenitiesLoaded} village_amenities rows under dataset_versions ${datasetVersion.id}`
  )

  console.log('Backfilling DIGIPINs for villages that now have coordinates…')
  const backfill = await backfillDigipins({
    findVillagesNeedingDigipin: async () => {
      const rows = (await db.execute(sql`
        select v.id as id, ST_Y(v.geom) as lat, ST_X(v.geom) as lon
        from villages v
        join blocks b on b.id = v.block_id
        where b.district_id = ${maduraiDistrict.id} and v.geom is not null and v.digipin is null
      `)) as unknown as Array<{ id: string; lat: number | string; lon: number | string }>
      return rows.map((r) => ({ id: r.id, lat: Number(r.lat), lon: Number(r.lon) }))
    },
    updateVillageDigipin: async (villageId, digipin) => {
      await db.update(villages).set({ digipin, updatedAt: new Date() }).where(sql`${villages.id} = ${villageId}`)
    },
  })
  console.log(`DIGIPIN backfill: ${backfill.updated} updated, ${backfill.failed.length} failed`)
  for (const f of backfill.failed) console.log(`  village ${f.id}: ${f.error}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
