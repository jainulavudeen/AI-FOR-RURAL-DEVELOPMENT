import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applicants } from './applicants.js'

// A genuine, append-only "who did what, when" trail backing the Admin
// Portal's audit log view (CLAUDE.md item 6). Every officer/admin action
// that changes something another party relies on writes one row here —
// today that's an appeal status update (feedback/service.ts's
// updateAppealStatus), a bank dossier approval (bankDossier/service.ts's
// approveDossier), and an admin reassigning an appeal
// (modules/admin/service.ts's reassignAppeal). Deliberately generic
// (action/targetType/targetId/metadata) rather than one column per action
// type, so a future action can start logging here without a schema
// change. No update/delete route exists or should.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => applicants.id),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_actor_id_idx').on(table.actorId),
    index('audit_log_target_idx').on(table.targetType, table.targetId),
    index('audit_log_created_at_idx').on(table.createdAt),
  ]
)
