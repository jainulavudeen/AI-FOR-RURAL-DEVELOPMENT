import { sql } from 'drizzle-orm'
import { index, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'
import { blocks } from './blocks.js'
import { districts } from './districts.js'

// Which districts/blocks an officer covers — set only by an admin
// (modules/admin). `block_id` null means the whole district. Drives
// application auto-assignment (modules/applications/assignment.ts): an
// officer covering the applicant's exact block is preferred over one
// covering the whole district; ties go to the fewest open cases.
export const officerJurisdictions = pgTable(
  'officer_jurisdictions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    officerId: uuid('officer_id')
      .notNull()
      .references(() => applicants.id),
    districtId: uuid('district_id')
      .notNull()
      .references(() => districts.id),
    blockId: uuid('block_id').references(() => blocks.id),
    createdBy: uuid('created_by').references(() => applicants.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('officer_jurisdictions_unique').on(table.officerId, table.districtId, table.blockId).nullsNotDistinct(),
    index('officer_jurisdictions_officer_idx').on(table.officerId),
    index('officer_jurisdictions_district_idx').on(table.districtId),
  ]
)
