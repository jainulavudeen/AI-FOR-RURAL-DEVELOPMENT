import { sql } from 'drizzle-orm'
import { doublePrecision, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants'
import { reports } from './reports'

// Geotagged site-capture evidence (camera photo + DIGIPIN pin) for a
// proposed business site — turns "hyper-local" into something a bank or
// CSC officer can actually verify. `photoDataUrl` stores the client-
// compressed JPEG as a base64 data URL directly in Postgres: a real
// production deployment would want object storage (S3/GCS) instead of
// blob-in-Postgres, but that needs cloud storage credentials this
// environment doesn't have — Postgres storage is a real, working choice
// for a pilot-scale demo, not a mock. `consentAt` is required and NOT
// NULL by construction: a row can only exist here because consent was
// given, at this recorded time — there is no code path that inserts a row
// without it (see modules/siteCapture/service.ts).
export const siteCaptures = pgTable('site_captures', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  applicantId: uuid('applicant_id')
    .notNull()
    .references(() => applicants.id),
  reportId: uuid('report_id').references(() => reports.id),
  digipin: text('digipin').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  photoDataUrl: text('photo_data_url').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
