import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { blocks } from './blocks.js'
import { datasetVersions } from './datasetVersions.js'

// NRLM SHG registry — active Self-Help Groups per block, by social
// category. Block grain (not village), matching the source's actual
// reporting granularity. No data has actually been loaded here yet — see
// CLAUDE.md: nrlm.gov.in currently serves the wrong SSL certificate (a
// live infrastructure failure), and no working Tamil Nadu alternative was
// found. This is scaffolding, ready for whenever a real source exists.
export const shgRegistry = pgTable(
  'shg_registry',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    blockId: uuid('block_id')
      .notNull()
      .references(() => blocks.id),
    socialCategory: text('social_category').notNull(),
    activeShgCount: integer('active_shg_count').notNull(),
    asOfDate: date('as_of_date').notNull(),
    datasetVersionId: uuid('dataset_version_id')
      .notNull()
      .references(() => datasetVersions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('shg_registry_block_category_date_unique').on(table.blockId, table.socialCategory, table.asOfDate),
    index('shg_registry_block_id_idx').on(table.blockId),
    check(
      'shg_registry_social_category_check',
      sql`${table.socialCategory} in ('sc', 'st', 'obc', 'minority', 'general', 'total')`
    ),
  ]
)
