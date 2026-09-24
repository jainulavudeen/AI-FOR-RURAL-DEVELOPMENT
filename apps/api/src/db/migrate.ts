import '../config/loadEnv.js'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../config/env.js'

async function main() {
  const migrationClient = postgres(env.DATABASE_URL, { max: 1 })
  const db = drizzle(migrationClient)
  await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname })
  await migrationClient.end()
  console.log('Migrations applied')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
