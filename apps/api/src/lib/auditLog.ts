// Shared shape for writing to the audit_log table (see
// db/schema/auditLog.ts) — used by every module that records an
// oversight-relevant action (feedback's appeal status updates,
// bankDossier's approvals, admin's reassignments) and read back by
// modules/admin/service.ts. Each module wires its own
// `insertAuditLogEntry` dep straight to fastify.db, matching this app's
// existing per-module deps pattern — this file only centralizes the type,
// not a shared service layer.
export interface AuditLogEntryInput {
  actorId: string
  actorRole: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}
