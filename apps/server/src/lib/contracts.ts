import { z } from 'zod'
import { AUDIT_SEVERITIES } from '../db/schema'

/**
 * Server-internal output contracts (CLAUDE.md §19.2; this stage's no-slop footer).
 *
 * These responses are consumed by webhook providers and the admin tool, not by the
 * renderer, so their Zod schemas live with the server rather than in `@cairn/shared-zod`
 * (which is reserved for shapes shared across desktop/web/server). Every endpoint that
 * returns one of these is wired through `sendValidated`, so any drift between the
 * handler's output and these schemas surfaces as a tested `INTERNAL` error.
 */

/** Acknowledgement returned by both webhook receivers (Stripe + Razorpay). */
export const webhookAckSchema = z.object({
  /** The signature verified and the event was accepted. */
  received: z.literal(true),
  /** True when this delivery duplicated an already-processed event (no state change). */
  duplicate: z.boolean(),
})
export type WebhookAck = z.infer<typeof webhookAckSchema>

/** One row of the append-only audit log, as returned to an admin. */
export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  event: z.string(),
  severity: z.enum(AUDIT_SEVERITIES),
  /** Structured, non-sensitive context. Opaque to the schema — never secrets. */
  detail: z.unknown(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>

/** GET /admin/audit-log response. */
export const auditLogOutputSchema = z.object({
  entries: z.array(auditLogEntrySchema),
})
export type AuditLogOutput = z.infer<typeof auditLogOutputSchema>
