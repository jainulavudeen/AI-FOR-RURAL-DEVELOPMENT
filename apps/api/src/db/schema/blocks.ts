import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { geometry } from './customTypes'
import { districts } from './districts'

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    districtId: uuid('district_id')
      .notNull()
      .references(() => districts.id),
    name: text('name').notNull(),
    // Same stable-join-key principle as districts.code — see that file's
    // header. Nullable for the same reason.
    code: text('code').unique(),
    digipin: text('digipin'),
    geom: geometry('geom', { type: 'Polygon', srid: 4326 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('blocks_district_name_unique').on(table.districtId, table.name),
    index('blocks_district_id_idx').on(table.districtId),
    index('blocks_geom_gist_idx').using('gist', table.geom),
  ]
)
