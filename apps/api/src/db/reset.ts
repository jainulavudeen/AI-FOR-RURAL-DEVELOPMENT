import '../config/loadEnv'
import { sql } from 'drizzle-orm'
import { db } from './client'
import { seedDemoData } from './seed'

// Restores the demo dataset to a known-clean state between runs — for a
// judge/demo reset, not a general-purpose "wipe the database" tool.
// Deliberately scoped to exactly the tables seedDemoData itself writes:
// applicants/districts/blocks/scheme_rules/reports/appeals/
// informal_lending_rates.
const DEMO_TABLES = ['appeals', 'reports', 'informal_lending_rates', 'applicants', 'blocks', 'districts', 'scheme_rules']

// `villages` FKs to blocks/districts (and village_amenities/
// gp_infrastructure_indicators/shg_registry FK to villages in turn) — a
// first version of this script used TRUNCATE ... CASCADE, which silently
// cascaded through that chain and would have wiped real ingested
// Census/Mission Antyodaya data on any database that actually had it
// loaded (this repo's dev DB didn't, so the bug shipped unnoticed until
// caught here). Fixed by refusing to proceed at all if any of these
// tables aren't empty, rather than trusting CASCADE to leave them alone —
// loud failure beats silent data loss.
const MUST_BE_EMPTY_TABLES = ['villages', 'village_amenities', 'gp_infrastructure_indicators', 'shg_registry']

async function main() {
  const start = Date.now()

  for (const table of MUST_BE_EMPTY_TABLES) {
    const [row] = await db.execute(sql.raw(`SELECT count(*)::int AS count FROM ${table}`))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = (row as any)?.count ?? 0
    if (count > 0) {
      throw new Error(
        `Refusing to reset: "${table}" has ${count} row(s) of real ingested data. ` +
          `This script only resets the demo applicant/report dataset, never ingested Census/Mission Antyodaya/NRLM data — ` +
          `truncating districts/blocks would cascade into it. Investigate before proceeding.`
      )
    }
  }

  // Safe now: every table that FKs (transitively) to districts/blocks is
  // confirmed empty, so CASCADE here has nothing real to reach.
  await db.execute(sql.raw(`TRUNCATE TABLE ${DEMO_TABLES.join(', ')} RESTART IDENTITY CASCADE`))

  await seedDemoData(db)

  const seconds = ((Date.now() - start) / 1000).toFixed(2)
  console.log(`Demo dataset reset in ${seconds}s`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => process.exit())
