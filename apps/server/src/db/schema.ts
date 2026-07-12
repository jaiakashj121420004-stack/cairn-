import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Server database schema (CLAUDE.md §18.5).
 *
 * Only the auth-relevant tables are defined in this stage: identity, credentials,
 * sessions (refresh-token families), single-use email tokens, the audit log, and a
 * minimal subscription record used to resolve entitlements. The vault/device/webhook
 * tables arrive with their own stages.
 *
 * Conventions: snake_case columns (§13.2), `timestamptz` for all times stored UTC
 * (§19.5), text + CHECK for small enums (idempotent to (re)create, see the migration).
 */

/** A person. Email is the login identifier; verification gates sync access. */
export const users = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Canonical (lower-cased, trimmed) email. Unique, case-insensitive by storage. */
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnique: uniqueIndex('user_email_unique').on(t.email),
  }),
)

/** Password credential for a user. Separated from `user` so other methods (OAuth) can coexist. */
export const userCredentials = pgTable(
  'user_credential',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Full Argon2id PHC string (`$argon2id$...`). Never the raw or peppered password. */
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUnique: uniqueIndex('user_credential_user_unique').on(t.userId),
  }),
)

/**
 * A refresh-token session. Sessions form a *family* (`familyId`) across rotations.
 * On each refresh a new row is created and the old row's `replacedBy` is set. Re-use
 * of an already-replaced (or revoked) token triggers family-wide revocation
 * (CLAUDE.md §2.13 refresh-reuse detection).
 */
export const userSessions = pgTable(
  'user_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Constant across an entire rotation chain. Revocation operates on this. */
    familyId: uuid('family_id').notNull(),
    /** SHA-256 (hex) of the opaque refresh token. The raw token is never stored. */
    refreshHash: text('refresh_hash').notNull(),
    /** Set to the id of the session that rotated this one. Non-null ⇒ already used. */
    replacedBy: uuid('replaced_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Coarse client fingerprint for the audit trail. Not security-bearing. */
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    refreshUnique: uniqueIndex('user_session_refresh_unique').on(t.refreshHash),
    familyIdx: index('user_session_family_idx').on(t.familyId),
    userIdx: index('user_session_user_idx').on(t.userId),
  }),
)

/** Token types delivered by email. */
export const EMAIL_TOKEN_TYPES = ['verify', 'magic', 'reset'] as const
export type EmailTokenType = (typeof EMAIL_TOKEN_TYPES)[number]

/** A single-use, hashed, expiring token sent by email (verify + magic link). */
export const emailTokens = pgTable(
  'email_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<EmailTokenType>(),
    /** SHA-256 (hex) of the opaque token. The raw token is never stored. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUnique: uniqueIndex('email_token_hash_unique').on(t.tokenHash),
    userTypeIdx: index('email_token_user_type_idx').on(t.userId, t.type),
  }),
)

/** Audit severities. `critical` is used for refresh-token reuse (session compromise). */
export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number]

/** Append-only security/audit log. Never contains secrets or plaintext. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    event: text('event').notNull(),
    severity: text('severity').notNull().$type<AuditSeverity>(),
    /** Structured, non-sensitive context (ids, counts). Never tokens or passwords. */
    detail: jsonb('detail'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('audit_log_user_idx').on(t.userId),
    severityIdx: index('audit_log_severity_idx').on(t.severity),
  }),
)

/** Subscription / entitlement states (CLAUDE.md §2.14, §20). */
export const ENTITLEMENTS = ['free', 'trial', 'pro'] as const
export type EntitlementValue = (typeof ENTITLEMENTS)[number]

/**
 * Subscription lifecycle status — the §20.5 state machine's position. Distinct from
 * `entitlement` (the feature-gating value): a `past_due` row still grants `pro`
 * features until its grace window lapses. Absence of a row ⇒ free (no lifecycle).
 */
export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'canceled'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

/**
 * Canonical subscription state for a user (CLAUDE.md §2.14). The full billing
 * machinery lands in Stage 6; here it backs `resolveEntitlement` so the access
 * token can carry the right entitlement. Absence of a row ⇒ free.
 */
export const subscriptions = pgTable(
  'subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entitlement: text('entitlement').notNull().$type<EntitlementValue>().default('free'),
    /** Lifecycle position in the §20.5 state machine. Seeded `trial` at checkout. */
    status: text('status').notNull().$type<SubscriptionStatus>().default('trial'),
    /** When a free trial ends (set at checkout: now + 14 days). Null once converted. */
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    /** Region recorded at checkout that selected the gateway (`IN` ⇒ Razorpay). */
    billingRegion: text('billing_region'),
    /** When the current entitlement lapses (trial end / paid period end). */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** Grace-period hard cutoff after a failed renewal (CLAUDE.md §20). */
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    /** Which provider owns this subscription (`stripe` | `razorpay` | `dodo`), once known. */
    provider: text('provider').$type<WebhookProvider>(),
    /** Provider-side customer id — needed to open the billing portal. */
    providerCustomerId: text('provider_customer_id'),
    /** Provider-side subscription id — needed to cancel. */
    providerSubscriptionId: text('provider_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUnique: uniqueIndex('subscription_user_unique').on(t.userId),
  }),
)

/**
 * Registered sync devices. Only non-revoked devices belonging to the authenticated
 * user may push or pull vault ops (CLAUDE.md §18.5). Revocation is soft (revokedAt).
 */
export const devices = pgTable(
  'device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('device_user_idx').on(t.userId),
  }),
)

/** Op types for vault operations. */
export const VAULT_OP_TYPES = ['upsert', 'delete'] as const
export type VaultOpType = (typeof VAULT_OP_TYPES)[number]

/**
 * Immutable append-only log of encrypted vault ops. Each row is an opaque AEAD
 * ciphertext — the server never decrypts or inspects `payload_ciphertext`
 * (CLAUDE.md §2.4, §2.13). The serial `id` is the global cursor for sync.
 */
export const vaultOps = pgTable(
  'vault_op',
  {
    /** Auto-incrementing global cursor for sync pagination. */
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(),
    opType: text('op_type').notNull().$type<VaultOpType>(),
    /** Base64 AEAD ciphertext. Stored verbatim; never read by server code. */
    payloadCiphertext: text('payload_ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('vault_op_user_idx').on(t.userId),
    userTableIdx: index('vault_op_user_table_idx').on(t.userId, t.tableName),
  }),
)

/**
 * Per-user vault metadata: key version, schema version, and the wrapped key material
 * the client needs to unlock the vault on a new device (CLAUDE.md §2.4, §18.4).
 *
 * The key columns are nullable: a row may exist with only versions (legacy) and gains
 * the wrapped key on enrollment (PUT /vault/key). The server stores these blobs
 * verbatim and never decrypts them — `wrappedDataKey`/`recoveryWrappedDataKey` are the
 * data key sealed under the password KEK and the recovery-phrase KEK respectively,
 * `kdfSalt` is the per-vault Argon2id salt, and `kdf` is the params descriptor.
 */
export const vaultMeta = pgTable('vault_meta', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  keyVersion: integer('key_version').notNull().default(1),
  schemaVersion: integer('schema_version').notNull().default(1),
  /** Data key wrapped under the password-derived KEK (wire `WrappedKey`). Null until enrolled. */
  wrappedDataKey: jsonb('wrapped_data_key'),
  /** Data key wrapped under the recovery-phrase KEK (wire `WrappedKey`). Null until enrolled. */
  recoveryWrappedDataKey: jsonb('recovery_wrapped_data_key'),
  /** base64 of the 16-byte per-vault Argon2id salt for the password path. Null until enrolled. */
  kdfSalt: text('kdf_salt'),
  /** Argon2id params descriptor (wire `KdfParamsWire`). Null until enrolled. */
  kdf: jsonb('kdf'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Supported webhook providers. */
export const WEBHOOK_PROVIDERS = ['stripe', 'razorpay', 'dodo'] as const
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number]

/**
 * Idempotency ledger for incoming webhooks (CLAUDE.md §2.14, §2.13).
 * INSERT … ON CONFLICT DO NOTHING ensures each provider+external_id is processed
 * exactly once, even under concurrent duplicate deliveries.
 */
export const webhookEvents = pgTable(
  'webhook_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull().$type<WebhookProvider>(),
    /** Provider-assigned event id (e.g. Stripe `evt_xxx`, Razorpay `pay_xxx`). */
    externalId: text('external_id').notNull(),
    eventType: text('event_type').notNull(),
    /** Full event payload as received (JSONB). Never contains decrypted user content. */
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerExtUnique: uniqueIndex('webhook_event_provider_external_unique').on(
      t.provider,
      t.externalId,
    ),
  }),
)

/** Schema version marker applied by the migrator. */
export const schemaMigrations = pgTable('schema_migration', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})
