import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// The versioned, server-audited source of truth for the business-type
// catalogue — the same "static default vs. DB source of truth"
// relationship packages/core's schemes.ts has to apps/api's scheme_rules
// table (see CLAUDE.md). apps/web/src/data/businesses.js stays the static
// default that makes the offline Wizard work with zero backend; this
// table lets new business types be added by inserting a row, not a
// redeploy, and apps/web's Wizard overlays it non-blocking (the same
// "renders instantly from the static list, enriches if the GET resolves"
// pattern lib/feasibility.js's applyDemandSignal already uses) — never a
// hard dependency for a screen that must work offline.
//
// `id` is a stable slug (e.g. 'mobile_electronics'), not a uuid — it's
// referenced by packages/core's BASE_SCORE map and apps/web's
// nameKey/descKey/SWOT lookups by this exact string, so it has to be
// human-assignable and match those keys precisely, the same convention
// SCHEMES/SOCIAL_SCHEMES ids already use.
export const businessTypes = pgTable('business_types', {
  id: text('id').primaryKey(),
  icon: text('icon').notNull(),
  nameKey: text('name_key').notNull(),
  descKey: text('desc_key').notNull(),
  baseScore: integer('base_score').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
