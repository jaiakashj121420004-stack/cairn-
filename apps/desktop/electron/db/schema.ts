import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const propFirms = sqliteTable('prop_firms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  defaultStepCount: integer('default_step_count').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const accountTemplates = sqliteTable('account_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  propFirmId: text('prop_firm_id')
    .notNull()
    .references(() => propFirms.id),
  stepCount: integer('step_count').notNull(),
  accountSizeCents: integer('account_size_cents').notNull(),
  leverage: integer('leverage').notNull(),
  dailyDrawdownType: text('daily_drawdown_type').notNull(),
  dailyDrawdownValue: integer('daily_drawdown_value').notNull(),
  totalDrawdownType: text('total_drawdown_type').notNull(),
  totalDrawdownValue: integer('total_drawdown_value').notNull(),
  drawdownBasis: text('drawdown_basis').notNull(),
  profitTargetPhase1Pct: integer('profit_target_phase_1_pct').notNull(),
  profitTargetPhase2Pct: integer('profit_target_phase_2_pct'),
  profitTargetPhase3Pct: integer('profit_target_phase_3_pct'),
  minTradingDays: integer('min_trading_days'),
  maxTradingDays: integer('max_trading_days'),
  weekendHoldingAllowed: integer('weekend_holding_allowed').notNull(),
  newsTradingAllowed: integer('news_trading_allowed').notNull(),
  consistencyRulePct: integer('consistency_rule_pct'),
  notes: text('notes'),
  isArchived: integer('is_archived').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  templateId: text('template_id').references(() => accountTemplates.id),
  propFirmId: text('prop_firm_id')
    .notNull()
    .references(() => propFirms.id),
  stepCount: integer('step_count').notNull(),
  currentPhase: integer('current_phase').notNull(),
  accountSizeCents: integer('account_size_cents').notNull(),
  leverage: integer('leverage').notNull().default(100),
  dailyDrawdownType: text('daily_drawdown_type').notNull(),
  dailyDrawdownValue: integer('daily_drawdown_value').notNull(),
  totalDrawdownType: text('total_drawdown_type').notNull(),
  totalDrawdownValue: integer('total_drawdown_value').notNull(),
  drawdownBasis: text('drawdown_basis').notNull(),
  profitTargetPct: integer('profit_target_pct').notNull(),
  minTradingDays: integer('min_trading_days'),
  maxTradingDays: integer('max_trading_days'),
  weekendHoldingAllowed: integer('weekend_holding_allowed').notNull(),
  newsTradingAllowed: integer('news_trading_allowed').notNull(),
  consistencyRulePct: integer('consistency_rule_pct'),
  challengeCostCents: integer('challenge_cost_cents').notNull(),
  startDate: integer('start_date').notNull(),
  status: text('status').notNull(),
  endDate: integer('end_date'),
  endReason: text('end_reason'),
  peakEquityCents: integer('peak_equity_cents').notNull(),
  currentEquityCents: integer('current_equity_cents').notNull(),
  notes: text('notes'),
  // v1.1: configurable circuit-breaker fields
  dailyTradeLimit: integer('daily_trade_limit'),
  maxDailyLossPct: real('max_daily_loss_pct'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const accountRules = sqliteTable('account_rules', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  ruleKey: text('rule_key').notNull(),
  enabled: integer('enabled').notNull().default(1),
  value: text('value').notNull(),
  priority: integer('priority').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const pairs = sqliteTable('pairs', {
  id: text('id').primaryKey(),
  symbol: text('symbol').notNull().unique(),
  displayName: text('display_name').notNull(),
  assetClass: text('asset_class').notNull(),
  pipDecimal: integer('pip_decimal').notNull(),
  pipValuePerStandardLotCents: integer('pip_value_per_standard_lot_cents').notNull(),
  correlatedWith: text('correlated_with'),
  active: integer('active').notNull().default(1),
  displayOrder: integer('display_order').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const setups = sqliteTable('setups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  color: text('color').notNull(),
  active: integer('active').notNull().default(1),
  displayOrder: integer('display_order').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const killzones = sqliteTable('killzones', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startTimeUtc: text('start_time_utc').notNull(),
  endTimeUtc: text('end_time_utc').notNull(),
  color: text('color').notNull(),
  active: integer('active').notNull().default(1),
  displayOrder: integer('display_order').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  sessionDate: text('session_date').notNull(),
  dailyBias: text('daily_bias').notNull(),
  dailyBiasReason: text('daily_bias_reason').notNull(),
  h4Bias: text('h4_bias').notNull(),
  h4BiasReason: text('h4_bias_reason').notNull(),
  h1Bias: text('h1_bias').notNull(),
  h1BiasReason: text('h1_bias_reason').notNull(),
  htfLiquidityTarget: text('htf_liquidity_target'),
  dxyBias: text('dxy_bias'),
  smtNotes: text('smt_notes'),
  sessionPlan: text('session_plan'),
  keyLevels: text('key_levels'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lockedAt: integer('locked_at'),
  // v2.0 sync (migration 0013): soft-delete tombstone so a removed session
  // syncs like any other row rather than vanishing only locally.
  deletedAt: integer('deleted_at'),
})

export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  sessionId: text('session_id').references(() => sessions.id),
  pairId: text('pair_id')
    .notNull()
    .references(() => pairs.id),
  setupId: text('setup_id')
    .notNull()
    .references(() => setups.id),
  killzoneId: text('killzone_id').references(() => killzones.id),
  mode: text('mode').notNull(),
  direction: text('direction').notNull(),
  status: text('status').notNull(),
  // Plan
  entryPrice: integer('entry_price').notNull(),
  stopLossPrice: integer('stop_loss_price').notNull(),
  takeProfitPrice: integer('take_profit_price').notNull(),
  slPips: integer('sl_pips').notNull(),
  rrRatio: integer('rr_ratio').notNull(),
  lotSize: integer('lot_size').notNull(),
  riskAmountCents: integer('risk_amount_cents').notNull(),
  riskPctBps: integer('risk_pct_bps').notNull(),
  plannedInvalidation: text('planned_invalidation').notNull(),
  // Context
  mssConfirmed: integer('mss_confirmed').notNull(),
  htfBiasAligned: integer('htf_bias_aligned').notNull(),
  dxyAligned: integer('dxy_aligned'),
  smtConfirmed: integer('smt_confirmed'),
  correlatedPairUsed: text('correlated_pair_used'),
  // Emotional state pre-trade
  preCalmScore: integer('pre_calm_score').notNull(),
  preUrgencyScore: integer('pre_urgency_score').notNull(),
  preNeedScore: integer('pre_need_score').notNull(),
  // Execution
  actualEntryPrice: integer('actual_entry_price'),
  actualEntryTime: integer('actual_entry_time'),
  exitPrice: integer('exit_price'),
  exitTime: integer('exit_time'),
  exitReason: text('exit_reason'),
  pnlCents: integer('pnl_cents'),
  pnlR: integer('pnl_r'),
  pnlPctBps: integer('pnl_pct_bps'),
  maxDrawdownDuringTradePctBps: integer('max_drawdown_during_trade_pct_bps'),
  maePips: integer('mae_pips'),
  mfePips: integer('mfe_pips'),
  durationMinutes: integer('duration_minutes'),
  // Honesty
  followedPlanExactly: integer('followed_plan_exactly'),
  planChangesDescription: text('plan_changes_description'),
  slMoved: integer('sl_moved'),
  slMovedReason: text('sl_moved_reason'),
  tpMoved: integer('tp_moved'),
  enteredBeforeMss: integer('entered_before_mss'),
  revengeTradeFlag: integer('revenge_trade_flag'),
  rulesBroken: text('rules_broken'),
  isClean: integer('is_clean'),
  // Post-trade reflection
  postCalmScore: integer('post_calm_score'),
  whatIDidRight: text('what_i_did_right'),
  whatIDidWrong: text('what_i_did_wrong'),
  tags: text('tags'),
  // v1.2 Wave 3: two-phase logging. 0 = deferred reflection (Phase 2) still owed;
  // 1 = reflection captured. New rows default 0; existing closed rows backfilled to 1.
  phase2Complete: integer('phase_2_complete').notNull().default(0),
  // v1.1: optional screenshot attachment (never required, never blocks submission)
  screenshotPath: text('screenshot_path'),
  // v1.1: wall-clock timestamp when a planned trade was activated (planned → open)
  openedAt: integer('opened_at'),
  // import / broker
  brokerSource: text('broker_source'),
  brokerTradeId: text('broker_trade_id'),
  importedAt: integer('imported_at'),
  externalRef: text('external_ref'),
  // Timestamps
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const playbooks = sqliteTable('playbooks', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  name: text('name').notNull(),
  pairId: text('pair_id').references(() => pairs.id),
  setupId: text('setup_id')
    .notNull()
    .references(() => setups.id),
  killzoneId: text('killzone_id').references(() => killzones.id),
  requiredConfluenceMd: text('required_confluence_md'),
  /** Risk % as integer basis points: 1.5% → 150. null = use account default. */
  defaultRiskPct: integer('default_risk_pct'),
  /** Chip id from INVALIDATION_CHIPS (e.g. "below-ob"), or null for free-text. */
  defaultInvalidationChip: text('default_invalidation_chip'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
})

export const tradeScreenshots = sqliteTable('trade_screenshots', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id')
    .notNull()
    .references(() => trades.id),
  kind: text('kind').notNull(),
  filename: text('filename').notNull(),
  caption: text('caption'),
  createdAt: integer('created_at').notNull(),
})

// The single canonical partial-close table (migration 0004 consolidated the
// former float `partial_closes` into this one). All money/pip columns are
// integer-encoded per CLAUDE.md §2.5/§19.5:
//   close_percent_bps : basis points (50.0% → 5000)
//   close_lots        : lots × 100
//   exit_price        : price tick, round(realPrice × 10^(pipDecimal+1))
//   pnl_r             : R × 100 (1.5R → 150)
//   pnl_cents         : integer cents
export const tradePartials = sqliteTable('trade_partials', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id')
    .notNull()
    .references(() => trades.id),
  closePercentBps: integer('close_percent_bps').notNull(),
  closeLots: integer('close_lots'),
  exitPrice: integer('exit_price').notNull(),
  exitTime: integer('exit_time').notNull(),
  pnlR: integer('pnl_r'),
  pnlCents: integer('pnl_cents'),
  notes: text('notes'),
  externalRef: text('external_ref'),
  createdAt: integer('created_at').notNull(),
  // v2.0 sync (migration 0013): partials are append-only children today, but the
  // sync engine treats every syncable row uniformly — these let an edited/removed
  // partial carry an updated_at and a soft-delete tombstone.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
})

export const ruleViolations = sqliteTable('rule_violations', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  tradeId: text('trade_id').references(() => trades.id),
  ruleKey: text('rule_key').notNull(),
  severity: text('severity').notNull(),
  outcome: text('outcome').notNull(),
  contextJson: text('context_json').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  accountId: text('account_id').references(() => accounts.id),
  periodType: text('period_type').notNull(),
  periodStart: text('period_start').notNull(),
  periodEnd: text('period_end').notNull(),
  topMistakes: text('top_mistakes').notNull(),
  bestTradeId: text('best_trade_id').references(() => trades.id),
  worstTradeId: text('worst_trade_id').references(() => trades.id),
  lessonNextPeriod: text('lesson_next_period').notNull(),
  ruleFocus: text('rule_focus'),
  adherenceScore: integer('adherence_score').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
})

export const cooldowns = sqliteTable('cooldowns', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  reason: text('reason').notNull(),
  startedAt: integer('started_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  clearedAt: integer('cleared_at'),
  clearedBy: text('cleared_by'),
  acknowledgmentText: text('acknowledgment_text'),
})

export const dismissedInsights = sqliteTable('dismissed_insights', {
  id: text('id').primaryKey(),
  insightId: text('insight_id').notNull(),
  accountId: text('account_id').references(() => accounts.id),
  dismissedUntil: integer('dismissed_until').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const notebookEntries = sqliteTable('notebook_entries', {
  id: text('id').primaryKey(),
  accountId: text('account_id').references(() => accounts.id),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  template: text('template'),
  pinned: integer('pinned').notNull().default(0),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

/**
 * Outbound sync queue (v2.0 Stage 18.6, docs/sync-protocol.md §2.3). The write path
 * (next stage) appends one row per local mutation; the push service drains it in
 * `created_at` order, encrypts each row's plaintext `payload` with the data key, and
 * deletes the row only after the server acknowledges the op. Stores plaintext on
 * purpose — the device is the only place plaintext ever exists; encryption happens at
 * push time so a key rotation re-encrypts the queue, not the journal.
 */
export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  /** 'upsert' | 'delete'. */
  opType: text('op_type').notNull(),
  /** Plaintext sync envelope (docs/sync-protocol.md §2.2) to encrypt at push; '' for a bare delete. */
  payload: text('payload').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

/**
 * Concurrent-edit conflicts retained for the user to resolve (v2.0 Stage 18.6,
 * docs/sync-protocol.md §4–5). A conflict is written when a pulled op's vector clock is
 * concurrent with the local record's clock — neither dominates. BOTH sides are kept
 * verbatim (provisional LWW never deletes the losing side); the Review-screen modal
 * surfaces them. `local_clock`/`remote_clock` are JSON vector clocks; `*_payload` are
 * the canonical envelope (remote) / local-row snapshot.
 */
export const syncConflicts = sqliteTable('sync_conflicts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  localClock: text('local_clock').notNull(),
  remoteClock: text('remote_clock').notNull(),
  localPayload: text('local_payload').notNull(),
  remotePayload: text('remote_payload').notNull(),
  remoteOpId: integer('remote_op_id').notNull(),
  remoteDeviceId: text('remote_device_id').notNull(),
  detectedAt: integer('detected_at').notNull(),
  resolvedAt: integer('resolved_at'),
})

/**
 * Pulled ops that could not be applied — set aside instead of silently dropped
 * (docs/sync-protocol.md §7.4, §8). `reason` is `DECRYPT_FAILED` (a foreign op whose
 * AEAD associated data didn't bind — likely a tampered/misrouted row) or `SCHEMA_INVALID`
 * (decrypted but failed the table's Zod schema). The raw `payload_ciphertext` is kept so
 * the op can be inspected or re-tried after a fix.
 */
export const syncQuarantine = sqliteTable('sync_quarantine', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  remoteOpId: integer('remote_op_id').notNull(),
  remoteDeviceId: text('remote_device_id').notNull(),
  reason: text('reason').notNull(),
  detail: text('detail').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(),
  createdAt: integer('created_at').notNull(),
})

/** Append-only audit log for sync decisions that aren't plain applies (conflicts, quarantines). */
export const syncAudit = sqliteTable('sync_audit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  event: text('event').notNull(),
  tableName: text('table_name'),
  recordId: text('record_id'),
  detail: text('detail').notNull(),
  createdAt: integer('created_at').notNull(),
})

/** Small key/value store for sync bookkeeping (currently the persisted pull cursor). */
export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: integer('value').notNull(),
})

/**
 * Durable per-record vector clocks (v2.0 Stage 18.6, docs/sync-protocol.md §3).
 * `clock` is the FULL JSON vector clock for `(table_name, record_id)` — every device's
 * component, not just this device's. The write path upserts the bumped clock here in the
 * same transaction as the `sync_queue` insert; the pull/merge path upserts the merged
 * clock in the page transaction. The in-memory `VectorClockCache` hydrates from this on
 * launch, so an idempotent op replay after a restart compares `equal` (not a phantom
 * `concurrent` conflict). Empty until sync is enrolled.
 */
export const syncClocks = sqliteTable(
  'sync_clocks',
  {
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(),
    clock: text('clock').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tableName, t.recordId] }),
  }),
)

/**
 * Live-broker → Cairn account bindings (Wave 4, docs/broker-integration.md §4/§6).
 *
 * Maps a broker-side `(broker, broker_account_id)` to the Cairn account every fill
 * on it is attributed to. A live fill whose `(broker, broker_account_id)` has no row
 * here resolves to no account and creates no trade — Cairn never guesses (CLAUDE.md
 * §14 #39). The unique index is PARTIAL (`WHERE deleted_at IS NULL`) so a removed
 * binding can be re-created for the same broker account.
 *
 * This is PER-DEVICE configuration (a binding is meaningless on another machine that
 * watches a different terminal), so it is deliberately NOT a syncable table — it is
 * intentionally absent from the sync engine's TABLE_SPECS (see
 * electron/services/sync/store.ts).
 */
export const brokerAccountMap = sqliteTable('broker_account_map', {
  id: text('id').primaryKey(),
  /** 'mt5' | 'ctrader'. */
  broker: text('broker').notNull(),
  brokerAccountId: text('broker_account_id').notNull(),
  cairnAccountId: text('cairn_account_id')
    .notNull()
    .references(() => accounts.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
})

export const backupLog = sqliteTable('backup_log', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  destination: text('destination').notNull(),
  filesizeBytes: integer('filesize_bytes').notNull(),
  status: text('status').notNull(),
  errorMessage: text('error_message'),
  createdAt: integer('created_at').notNull(),
})
