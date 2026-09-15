import { sql } from 'drizzle-orm'
import { index, integer, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { villages } from './villages'
import { datasetVersions } from './datasetVersions'

// Mission Antyodaya — 21 sectors x many indicators, mixed value types
// (numeric, boolean-as-text, categorical), so indicatorValue stays text
// with numericValue populated opportunistically by the parser. GP ≈
// village for this pilot — a documented simplification, not a claim
// they're the same administrative unit everywhere. No data has actually
// been loaded here yet — see CLAUDE.md: no reachable source was found for
// Mission Antyodaya at all, manual or automated. This is scaffolding.
export const gpInfrastructureIndicators = pgTable(
  'gp_infrastructure_indicators',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    villageId: uuid('village_id')
      .notNull()
      .references(() => villages.id),
    sector: text('sector').notNull(),
    indicatorName: text('indicator_name').notNull(),
    indicatorValue: text('indicator_value').notNull(),
    numericValue: numeric('numeric_value'),
    surveyYear: integer('survey_year').notNull(),
    datasetVersionId: uuid('dataset_version_id')
      .notNull()
      .references(() => datasetVersions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('gp_indicators_village_sector_indicator_year_unique').on(
      table.villageId,
      table.sector,
      table.indicatorName,
      table.surveyYear
    ),
    index('gp_indicators_village_id_idx').on(table.villageId),
  ]
)
