import { sql } from 'drizzle-orm'
import { boolean, index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { villages } from './villages'
import { datasetVersions } from './datasetVersions'

// Census 2011 Village Directory — nearest-facility distances. Deliberately
// long/tall (facilityType as a free-text column, not fixed bank/market/
// school columns): the exact facility taxonomy in the real source file
// wasn't confirmed before this schema was written (see CLAUDE.md), so this
// shape accommodates whatever the actual file names rather than guessing
// wrong column names.
export const villageAmenities = pgTable(
  'village_amenities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    villageId: uuid('village_id')
      .notNull()
      .references(() => villages.id),
    facilityType: text('facility_type').notNull(),
    distanceKm: numeric('distance_km'),
    availableInVillage: boolean('available_in_village').notNull().default(false),
    datasetVersionId: uuid('dataset_version_id')
      .notNull()
      .references(() => datasetVersions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotency key: re-running a loader upserts on (village, facility)
    // rather than inserting a new row per run.
    unique('village_amenities_village_facility_unique').on(table.villageId, table.facilityType),
    index('village_amenities_village_id_idx').on(table.villageId),
  ]
)
