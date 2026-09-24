import '../../config/loadEnv.js'
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { blocks, districts, shgRegistry } from '../../db/schema/index.js'
import { recordDatasetVersion } from '../datasetVersions.js'
import { loadShgRows, type LoadDeps } from './load.js'
import { parseShgFile } from './parse.js'
import { validateRows } from './validate.js'

const DEFAULT_FILE = new URL('../../../data/ingestion/nrlm-shg/madurai.csv', import.meta.url).pathname

function parseArgs() {
  const args = process.argv.slice(2)
  const fileArg = args.find((a) => a.startsWith('--file='))
  const filePath = fileArg ? fileArg.slice('--file='.length) : DEFAULT_FILE
  const dryRun = args.includes('--dry-run')
  return { filePath, dryRun }
}

async function main() {
  const { filePath, dryRun } = parseArgs()

  if (!existsSync(filePath)) {
    console.error(`No input file found at ${filePath}`)
    console.error('')
    console.error("No reachable source was found for the NRLM SHG registry — nrlm.gov.in currently")
    console.error("serves an SSL certificate for the wrong hostname (*.lokos.in), a live government-side")
    console.error('infrastructure failure. AIKosh\'s listing is broken, data.gov.in 403s, and Tamil')
    console.error("Nadu's own Mahalir Thittam district page 404s. See CLAUDE.md for the full record.")
    console.error('This loader is real and ready — it has nothing to load until a real source exists.')
    console.error('If you obtain an export, format it as CSV with columns:')
    console.error('  block_name,social_category,active_shg_count,as_of_date')
    console.error("  (social_category one of: sc, st, obc, minority, general, total; as_of_date YYYY-MM-DD)")
    console.error(`then place it at ${filePath} (or pass --file=<path>).`)
    process.exitCode = 1
    return
  }

  const parsed = parseShgFile(filePath)
  const { valid, rejected } = validateRows(parsed)

  console.log(`Parsed ${parsed.length} rows from ${filePath}: ${valid.length} valid, ${rejected.length} rejected`)
  for (const row of rejected) {
    console.log(`  row ${row.rowNumber}: ${row.errors.join('; ')}`)
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
    upsertShgCount: async (input) => {
      await db
        .insert(shgRegistry)
        .values({
          blockId: input.blockId,
          socialCategory: input.socialCategory,
          activeShgCount: input.activeShgCount,
          asOfDate: input.asOfDate,
          datasetVersionId: input.datasetVersionId,
        })
        .onConflictDoUpdate({
          target: [shgRegistry.blockId, shgRegistry.socialCategory, shgRegistry.asOfDate],
          set: {
            activeShgCount: input.activeShgCount,
            datasetVersionId: input.datasetVersionId,
            updatedAt: new Date(),
          },
        })
    },
  }

  const datasetVersion = await recordDatasetVersion(db, {
    source: 'nrlm_shg_registry',
    vintageLabel: `NRLM SHG Registry (as of ${valid[0]?.asOfDate ?? 'unknown'})`,
    sourceDescription: filePath,
    fetchedAt: new Date(),
    recordCount: valid.length,
    notes: rejected.length > 0 ? `${rejected.length} rows rejected — see run log` : undefined,
  })

  const { loaded } = await loadShgRows(deps, maduraiDistrict.id, valid, datasetVersion.id)
  console.log(`Loaded ${loaded} shg_registry rows under dataset_versions ${datasetVersion.id}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
