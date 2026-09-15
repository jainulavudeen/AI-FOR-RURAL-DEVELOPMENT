import { sql } from 'drizzle-orm'
import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { districts } from './districts'

// Two-tier lookup for the "cost of inaction" card: a district-specific
// rate if one has been ingested, else the single district_id-null
// regional fallback row. No real district-level ingestion pipeline exists
// yet (NABARD/NSSO's AIDIS survey is the real source — see CLAUDE.md; not
// ingested in this pass), so today every lookup returns the fallback row,
// honestly labeled via is_estimate rather than presented as measured data.
export const informalLendingRates = pgTable(
  'informal_lending_rates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    districtId: uuid('district_id').references(() => districts.id),
    ratePercent: numeric('rate_percent').notNull(),
    vintageLabel: text('vintage_label').notNull(),
    sourceDescription: text('source_description').notNull(),
    isEstimate: boolean('is_estimate').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('informal_lending_rates_district_id_idx').on(table.districtId)]
)
