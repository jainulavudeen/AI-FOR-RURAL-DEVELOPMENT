import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { geometry } from './customTypes'

export const districts = pgTable(
  'districts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    stateCode: text('state_code').notNull(),
    stateName: text('state_name').notNull(),
    name: text('name').notNull(),
    // A stable, immutable join key independent of `name` (CLAUDE.md item
    // 8+9's design principle: "store codes as the join key, names as
    // display only, so names can be corrected without breaking joins").
    // Nationwide ingestion (ingestion/adminHierarchy/) derives this from
    // SHRUG's shrid2 hierarchical code prefix (a real Census 2011 code,
    // not an official LGD code — lgdirectory.gov.in was unreachable, same
    // as every other CLAUDE.md Known Gap government portal). Nullable:
    // rows from a source with no comparable code (none exist yet, but
    // Mission Antyodaya's own coding scheme is documented as uncrossed
    // with shrid2 — see CLAUDE.md) aren't forced to fabricate one.
    code: text('code').unique(),
    digipin: text('digipin'),
    geom: geometry('geom', { type: 'MultiPolygon', srid: 4326 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('districts_state_name_unique').on(table.stateCode, table.name),
    index('districts_geom_gist_idx').using('gist', table.geom),
  ]
)
