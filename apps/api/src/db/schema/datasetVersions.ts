import { sql } from 'drizzle-orm'
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// One row per ingestion RUN — an append-only audit log, not per-fact-row
// state. Fact tables (village_amenities, gp_infrastructure_indicators,
// shg_registry) point at whichever run last wrote them via
// dataset_version_id, so a report can say exactly "Census 2011" (or
// whichever vintageLabel) for any figure it cites — see CLAUDE.md rule 3.
export const datasetVersions = pgTable('dataset_versions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  source: text('source').notNull(),
  // Human-facing citation string, e.g. "Census 2011" — distinct from
  // fetchedAt (when WE pulled it): this is what year/edition the source
  // data itself represents.
  vintageLabel: text('vintage_label').notNull(),
  sourceDescription: text('source_description').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  recordCount: integer('record_count').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
