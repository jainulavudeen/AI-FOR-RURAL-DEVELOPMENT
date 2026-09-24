import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'
import { schemeRules } from './schemeRules.js'

// One row per generated report. `scheme_rules_version` is a hard FK to the
// exact scheme_rules row used — the whole point of versioning that table.
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id),
    inputs: jsonb('inputs').notNull(),
    score: integer('score').notNull(),
    verdictKey: text('verdict_key').notNull(),
    matchedSchemeId: text('matched_scheme_id').notNull(),
    schemeRulesVersion: uuid('scheme_rules_version')
      .notNull()
      .references(() => schemeRules.id),
    emiSchedule: jsonb('emi_schedule').notNull(),
    dataVintage: jsonb('data_vintage').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('reports_applicant_id_idx').on(table.applicantId)]
)
