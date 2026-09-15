import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Loaded from the repo root regardless of the CLI's cwd, since apps/api has
// no .env of its own — see .env.example at the repo root.
config({ path: new URL('../../.env', import.meta.url).pathname })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env at the repo root first')
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
