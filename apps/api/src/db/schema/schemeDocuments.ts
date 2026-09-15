import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { datasetVersions } from './datasetVersions'

// Doc-level identity for the grounding corpus (CLAUDE.md: NSFDC, NBCFDC,
// NSKFDC, NHFDC, SEED, plus Jan Samarth). `contentHash` (sha256 of the full
// document text) is the re-embed trigger — ingestion/schemeDocuments/load.ts
// leaves a document's chunks untouched when the hash hasn't changed, and
// deletes + re-embeds them when it has, per CLAUDE.md's "embed once, re-embed
// on document change, tracked by a content hash."
export const schemeDocuments = pgTable('scheme_documents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  schemeId: text('scheme_id').notNull().unique(),
  title: text('title').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceDescription: text('source_description').notNull(),
  vintageLabel: text('vintage_label').notNull(),
  contentHash: text('content_hash').notNull(),
  datasetVersionId: uuid('dataset_version_id')
    .notNull()
    .references(() => datasetVersions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
