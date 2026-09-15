import { sql } from 'drizzle-orm'
import { integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

// Versioned rule sets — margin %, project-cost band, loan cap, rate, tenure,
// moratorium — with validity dates. reports.scheme_rules_version is a FK to
// the exact row here that produced a given report, so regenerating an old
// report against today's rules is impossible by construction (CLAUDE.md:
// "a report generated under rule-set vN must stay reproducible after vN+1").
export const schemeRules = pgTable(
  'scheme_rules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    schemeId: text('scheme_id').notNull(),
    version: integer('version').notNull(),
    marginPercent: numeric('margin_percent').notNull(),
    projectCostMin: numeric('project_cost_min').notNull(),
    projectCostMax: numeric('project_cost_max').notNull(),
    loanCap: numeric('loan_cap').notNull(),
    interestRate: numeric('interest_rate').notNull(),
    tenureYears: numeric('tenure_years').notNull(),
    moratoriumMonths: integer('moratorium_months').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('scheme_rules_scheme_version_unique').on(table.schemeId, table.version)]
)
