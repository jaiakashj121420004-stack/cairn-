import { auditLog } from '../db/schema'
import type { DbExecutor } from '../db/client'
import type { AuditSeverity } from '../db/schema'

/**
 * Append a row to the security audit log (CLAUDE.md §2.13).
 *
 * Append-only and never contains secrets or plaintext — only ids, counts, and event
 * names. The most important caller is refresh-token reuse detection, which logs a
 * `critical` row when a session family is force-revoked.
 */
export interface AuditEntry {
  readonly event: string
  readonly severity: AuditSeverity
  readonly userId?: string
  readonly ip?: string
  readonly detail?: Record<string, unknown>
}

export async function appendAudit(db: DbExecutor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    event: entry.event,
    severity: entry.severity,
    userId: entry.userId ?? null,
    ip: entry.ip ?? null,
    detail: entry.detail ?? null,
  })
}
