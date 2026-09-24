import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env'
import * as schema from './schema'

// prepare: false — required when DATABASE_URL points through a transaction-mode
// PgBouncer pooler (e.g. Supabase's pooled connection string, port 6543):
// prepared statements aren't valid across a pooled connection that gets
// handed to a different backend between statements. Harmless no-op against
// a direct connection (local docker-compose Postgres). max: 3 keeps each
// serverless container's own pool small — a large per-container pool
// defeats the point of pooling upstream when many containers run
// concurrently (Vercel); irrelevant for one long-running local/dev process.
const queryClient = postgres(env.DATABASE_URL, { prepare: false, max: 3 })
export const db = drizzle(queryClient, { schema })
export type Db = typeof db
