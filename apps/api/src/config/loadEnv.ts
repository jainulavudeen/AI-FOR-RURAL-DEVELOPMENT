import { config } from 'dotenv'

// apps/api has no .env of its own — env vars live in the repo-root .env
// (see .env.example). Load explicitly by file URL so this works regardless
// of the process's cwd (npm workspace scripts, tsx watch, drizzle-kit CLI).
config({ path: new URL('../../../../.env', import.meta.url).pathname })
