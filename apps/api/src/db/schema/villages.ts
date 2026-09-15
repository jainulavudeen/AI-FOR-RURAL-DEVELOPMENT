import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { geometry } from './customTypes'
import { blocks } from './blocks'

// One level finer than blocks — Census/Mission Antyodaya are village/GP
// grain. digipin/geom stay nullable until a real coordinate source exists
// (see CLAUDE.md Known Gaps: the ingestion pipeline's DIGIPIN backfill has
// nothing to compute against until villages actually carry coordinates).
export const villages = pgTable(
  'villages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    blockId: uuid('block_id')
      .notNull()
      .references(() => blocks.id),
    name: text('name').notNull(),
    lgdCode: text('lgd_code'),
    digipin: text('digipin'),
    geom: geometry('geom', { type: 'Point', srid: 4326 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('villages_block_name_unique').on(table.blockId, table.name),
    index('villages_block_id_idx').on(table.blockId),
    index('villages_digipin_idx').on(table.digipin),
    index('villages_geom_gist_idx').using('gist', table.geom),
  ]
)
