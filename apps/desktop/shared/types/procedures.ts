// Typed catalog of every cross-boundary procedure the desktop renderer can call
// (CLAUDE.md §3.6/§3.7, Stage 18.7). Keys are the exact existing IPC channel-name
// strings (see `electron/preload.ts`), so `ElectronTransport` is a direct passthrough
// with no name-translation, and the contract test is a plain string-equality check
// against the registered `ipcMain.handle` channels in `electron/ipc/**`.
//
// This is a type-only catalog — the IPC handlers keep validating inputs with their
// existing local Zod schemas (unchanged); nothing here duplicates that validation.
import type {
  PropFirm,
  AccountTemplate,
  Account,
  CreatePropFirmInput,
  UpdatePropFirmInput,
  CreateAccountTemplateInput,
  UpdateAccountTemplateInput,
  CreateAccountInput,
  UpdateAccountInput,
  AdvancePhaseInput,
  UpdateAccountPhasesInput,
  DraftTradeInput,
  EvaluateModificationInput,
  OverrideInputDTO,
  RuleEvaluationDTO,
  SessionStateDTO,
  AccountRuleConfigDTO,
  CloseDetectionDTO,
  UpsertAccountRuleInput,
  Pair,
  CreatePairInput,
  UpdatePairInput,
  Setup,
  CreateSetupInput,
  UpdateSetupInput,
  Killzone,
  CreateKillzoneInput,
  UpdateKillzoneInput,
  AccountStats,
  Session,
  CreateSessionInput,
  Trade,
  TradeListItem,
  TradeDetail,
  TradeScreenshot,
  TradeFilter,
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookStats,
  CreateTradeInput,
  CloseTradeInput,
  CloseMinimalInput,
  CompletePhase2Input,
  PartialCloseInput,
  DashboardStats,
  AnalyticsFilter,
  PerformanceStats,
  RuleAdherenceStats,
  SetupPerformanceStats,
  BehavioralStats,
  AccountsPhaseStats,
  DerivedStats,
  Insight,
  ReviewSummary,
  CreateReviewInput,
  NotebookEntry,
  NotebookEntrySummary,
  CreateNotebookEntryInput,
  UpdateNotebookEntryInput,
  NotebookSearchInput,
  BackupLogEntry,
  BackupResult,
  RestoreInfo,
  BackupSettings,
  ImportPreview,
  ImportCommitResult,
  Mt5PreviewInput,
  Mt5CommitInput,
  CTraderPreviewInput,
  CTraderCommitInput,
  TvPreviewInput,
  TvCommitInput,
} from './index'
import type {
  PublicSession,
  SignupResult,
  BrokerAccountMapEntry,
  BrokerDiagnostics,
  BrokerKind,
  BrokerStatus,
  Mt5BridgeConfig,
  CtraderEnvironment,
  CtraderRuntimeConfig,
  UnmappedBrokerAccount,
} from '@cairn/shared-types'
import type {
  SignupInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  CheckoutInputBody,
  CancelInputBody,
  BillingStatusOutput,
  CheckoutOutput,
  CancelOutput,
} from '@cairn/shared-zod'

// ─── Renderer-mirror DTOs (relocated from `src/lib/ipc.ts` — pure move, same shape) ──

export interface DbStatus {
  integrityOk: boolean
  migrationCount: number
  tradeCount: number
}

/** Renderer mirror of the main-process vault readiness snapshot (electron/ipc/vault.ts). */
export interface VaultStatus {
  unlocked: boolean
  needsPassword: boolean
}

/** Renderer mirror of an unlock outcome. `recoveryPhrase` is present once, on first enrollment. */
export interface UnlockVaultResult {
  enrolled: boolean
  recoveryPhrase?: readonly string[]
}

/** Renderer mirror of a manual-sync outcome (electron/ipc/sync.ts). */
export interface SyncNowResult {
  kind: string
  opCount?: number
}

/** Renderer mirror of the sync readiness snapshot (electron/ipc/sync.ts). */
export interface SyncStatusResult {
  configured: boolean
  paused: boolean
}

/** Renderer mirror of one unresolved sync conflict (electron/ipc/sync-conflicts.ts). */
export interface ConflictDTO {
  id: number
  tableName: string
  recordId: string
  detectedAt: number
  remoteDeviceId: string
  localData: Record<string, unknown> | null
  remoteData: Record<string, unknown> | null
}

// ─── Procedures catalog ───────────────────────────────────────────────────────

/**
 * Flat map of every renderer-facing IPC channel -> { input, output }, keyed by the
 * exact channel-name strings registered via `ipcMain.handle` (see `electron/ipc/**`
 * and `electron/preload.ts`). `output` is the `data` type of the resulting
 * `Result`/`IpcResponse` — not the wrapper itself.
 *
 * `backup:runScheduled` is intentionally absent: it is registered but never exposed
 * on `window.api` (internal main-process scheduling only) — see the contract test's
 * explicit allowlist.
 *
 * Plain literal-keyed interface (matches `ProceduresShape`'s shape but does not
 * `extends` it — see the note on `Transport<P>` in `packages/shared-types/src/transport.ts`
 * for why an index signature here would widen `keyof Procedures` to `string` and
 * break the exhaustive `Dispatch` mapped type in `ElectronTransport`).
 */
export interface Procedures {
  ping: { input: void; output: string }
  'db:status': { input: void; output: DbStatus }

  'settings:get': { input: { key: string }; output: string | null }
  'settings:set': { input: { key: string; value: string }; output: void }

  'propFirms:list': { input: void; output: PropFirm[] }
  'propFirms:create': { input: CreatePropFirmInput; output: PropFirm }
  'propFirms:update': { input: UpdatePropFirmInput; output: PropFirm }

  'accountTemplates:list': { input: void; output: AccountTemplate[] }
  'accountTemplates:create': { input: CreateAccountTemplateInput; output: AccountTemplate }
  'accountTemplates:update': { input: UpdateAccountTemplateInput; output: AccountTemplate }

  'accounts:list': { input: void; output: Account[] }
  'accounts:create': { input: CreateAccountInput; output: Account }
  'accounts:update': { input: UpdateAccountInput; output: Account }
  'accounts:stats': { input: void; output: AccountStats[] }
  'accounts:delete': { input: { id: string }; output: { ok: true } }
  'accounts:advancePhase': { input: AdvancePhaseInput; output: Account }
  'accounts:updatePhases': { input: UpdateAccountPhasesInput; output: Account }

  'pairs:list': { input: void; output: Pair[] }
  'pairs:create': { input: CreatePairInput; output: Pair }
  'pairs:update': { input: UpdatePairInput; output: Pair }

  'setups:list': { input: void; output: Setup[] }
  'setups:create': { input: CreateSetupInput; output: Setup }
  'setups:update': { input: UpdateSetupInput; output: Setup }

  'killzones:list': { input: void; output: Killzone[] }
  'killzones:create': { input: CreateKillzoneInput; output: Killzone }
  'killzones:update': { input: UpdateKillzoneInput; output: Killzone }

  'paths:pickFolder': { input: void; output: string | null }
  'paths:pickImages': { input: void; output: string[] }
  'paths:openFile': { input: { filePath: string }; output: void }

  'data:openFolder': { input: void; output: void }
  'data:export': { input: void; output: string }
  'data:exportPdf': { input: { defaultName?: string | undefined }; output: string }
  'data:reset': { input: { ack: string }; output: void }

  'rules:evaluatePreTrade': { input: DraftTradeInput; output: RuleEvaluationDTO[] }
  'rules:evaluateModification': { input: EvaluateModificationInput; output: RuleEvaluationDTO[] }
  'rules:getSessionState': { input: { accountId: string }; output: SessionStateDTO }
  'rules:override': { input: OverrideInputDTO; output: { ok: true } }
  'rules:clearCooldown': { input: { id: string; ack: string }; output: { ok: true } }
  'rules:onTradeClosed': { input: { tradeId: string }; output: { ok: true } }
  'rules:detectCloseViolations': { input: { tradeId: string }; output: CloseDetectionDTO[] }
  'rules:listAvailable': {
    input: void
    output: Array<{
      key: string
      label: string
      description: string
      category: string
      severity: string
      isHardLock: boolean
    }>
  }

  'accountRules:list': { input: { accountId: string }; output: AccountRuleConfigDTO[] }
  'accountRules:upsert': { input: UpsertAccountRuleInput; output: AccountRuleConfigDTO }

  'sessions:getToday': { input: { accountId: string }; output: Session | null }
  'sessions:upsert': { input: CreateSessionInput; output: Session }
  'sessions:lock': { input: { sessionId: string }; output: Session }

  'trades:create': { input: CreateTradeInput; output: Trade }
  'trades:setOpen': { input: { tradeId: string; accountId: string }; output: Trade }
  'trades:close': { input: CloseTradeInput; output: Trade }
  'trades:closeMinimal': { input: CloseMinimalInput; output: Trade }
  'trades:completePhase2': { input: CompletePhase2Input; output: Trade }
  'trades:partialClose': { input: PartialCloseInput; output: Trade }
  'trades:list': { input: TradeFilter; output: TradeListItem[] }
  'trades:listAwaitingReflection': {
    input: { accountId: string | null }
    output: TradeListItem[]
  }
  'trades:countAwaitingReflection': { input: { accountId: string | null }; output: number }
  'trades:get': { input: { tradeId: string }; output: TradeDetail }
  'trades:delete': { input: { tradeId: string }; output: { ok: true } }
  'trades:addScreenshot': {
    input: { tradeId: string; kind: string; sourcePath: string; caption?: string | undefined }
    output: TradeScreenshot
  }
  'trades:pickScreenshots': { input: { tradeId: string }; output: string[] }
  'trades:listScreenshots': { input: { tradeId: string }; output: TradeScreenshot[] }
  'trades:deleteScreenshot': { input: { screenshotId: string }; output: { ok: true } }

  'dashboard:getStats': { input: { accountId: string }; output: DashboardStats }

  'analytics:performance': { input: { filter: AnalyticsFilter }; output: PerformanceStats }
  'analytics:adherence': { input: { filter: AnalyticsFilter }; output: RuleAdherenceStats }
  'analytics:setups': { input: { filter: AnalyticsFilter }; output: SetupPerformanceStats }
  'analytics:behavioral': { input: { filter: AnalyticsFilter }; output: BehavioralStats }
  'analytics:phases': { input: void; output: AccountsPhaseStats }
  'analytics:derived': { input: { filter: AnalyticsFilter }; output: DerivedStats }
  'analytics:listReviews': { input: { accountId: string | null }; output: ReviewSummary[] }
  'analytics:createReview': { input: CreateReviewInput; output: ReviewSummary }
  'analytics:playbooks': { input: { filter: AnalyticsFilter }; output: PlaybookStats }

  'playbooks:list': { input: { accountId: string }; output: Playbook[] }
  'playbooks:get': { input: { id: string }; output: Playbook }
  'playbooks:create': { input: CreatePlaybookInput; output: Playbook }
  'playbooks:update': { input: UpdatePlaybookInput; output: Playbook }
  'playbooks:delete': { input: { id: string }; output: { ok: true } }

  'backup:getSettings': { input: void; output: BackupSettings }
  'backup:setSettings': { input: Partial<BackupSettings>; output: void }
  'backup:pickFolder': { input: void; output: string | null }
  'backup:now': { input: void; output: BackupResult }
  'backup:nowToFolder': { input: void; output: BackupResult }
  'backup:getLog': { input: void; output: BackupLogEntry[] }
  'backup:pickRestoreFile': { input: void; output: RestoreInfo & { path: string } }
  'backup:restore': { input: { path: string; ack: string }; output: void }
  'backup:reschedule': { input: void; output: void }

  'insights:list': { input: { accountId: string }; output: Insight[] }
  'insights:dismiss': { input: { accountId: string; insightId: string }; output: void }

  'notebook:list': { input: void; output: NotebookEntrySummary[] }
  'notebook:search': { input: NotebookSearchInput; output: NotebookEntrySummary[] }
  'notebook:get': { input: { id: string }; output: NotebookEntry }
  'notebook:create': { input: CreateNotebookEntryInput; output: NotebookEntry }
  'notebook:update': { input: UpdateNotebookEntryInput; output: NotebookEntry }
  'notebook:delete': { input: { id: string }; output: { ok: true } }

  'import:previewMt5': { input: Mt5PreviewInput; output: ImportPreview }
  'import:commitMt5': { input: Mt5CommitInput; output: ImportCommitResult }
  'import:previewCtrader': { input: CTraderPreviewInput; output: ImportPreview }
  'import:commitCtrader': { input: CTraderCommitInput; output: ImportCommitResult }
  'import:previewTradingView': { input: TvPreviewInput; output: ImportPreview }
  'import:commitTradingView': { input: TvCommitInput; output: ImportCommitResult }

  'sync:now': { input: void; output: SyncNowResult }
  'sync:status': { input: void; output: SyncStatusResult }
  'sync:conflicts:list': { input: void; output: ConflictDTO[] }
  'sync:conflicts:count': { input: void; output: number }
  'sync:conflicts:resolve': {
    input: { conflictId: number; winner: 'local' | 'remote' }
    output: { ok: true }
  }

  'vault:status': { input: void; output: VaultStatus }
  'vault:unlock': { input: { password: string }; output: UnlockVaultResult }
  'vault:recover': {
    input: { phrase: readonly string[]; newPassword: string }
    output: UnlockVaultResult
  }
  'vault:lock': { input: void; output: void }

  'broker:status': { input: void; output: BrokerStatus }
  'broker:getMt5Config': { input: void; output: Mt5BridgeConfig }
  'broker:getCtraderConfig': { input: void; output: CtraderRuntimeConfig }
  'broker:ctraderConnect': { input: void; output: void }
  'broker:ctraderDisconnect': { input: void; output: void }
  'broker:ctraderSetEnvironment': { input: CtraderEnvironment; output: void }
  'broker:listAccountMap': { input: void; output: BrokerAccountMapEntry[] }
  'broker:listUnmappedAccounts': { input: void; output: UnmappedBrokerAccount[] }
  'broker:setAccountMap': {
    input: { broker: BrokerKind; brokerAccountId: string; cairnAccountId: string }
    output: BrokerAccountMapEntry
  }
  'broker:deleteAccountMap': {
    input: { broker: BrokerKind; brokerAccountId: string }
    output: void
  }
  'broker:diagnostics': { input: void; output: BrokerDiagnostics }

  'auth:signup': { input: SignupInput; output: SignupResult }
  'auth:login': { input: LoginInput; output: PublicSession }
  'auth:logout': { input: void; output: void }
  'auth:getSession': { input: void; output: PublicSession | null }
  'auth:restore': { input: void; output: PublicSession | null }
  'auth:verifyEmail': { input: { token: string }; output: { verified: boolean } }
  'auth:forgotPassword': { input: ForgotPasswordInput; output: { sent: true } }
  'auth:resetPassword': { input: ResetPasswordInput; output: { reset: true } }

  'billing:status': { input: void; output: BillingStatusOutput }
  'billing:checkout': { input: CheckoutInputBody; output: CheckoutOutput }
  'billing:portal': { input: void; output: CheckoutOutput }
  'billing:cancel': { input: CancelInputBody; output: CancelOutput }
}

/** Runtime mirror of `Procedures`'s keys — used by the transport contract test. */
export const PROCEDURE_NAMES = [
  'ping',
  'db:status',
  'settings:get',
  'settings:set',
  'propFirms:list',
  'propFirms:create',
  'propFirms:update',
  'accountTemplates:list',
  'accountTemplates:create',
  'accountTemplates:update',
  'accounts:list',
  'accounts:create',
  'accounts:update',
  'accounts:stats',
  'accounts:delete',
  'accounts:advancePhase',
  'accounts:updatePhases',
  'pairs:list',
  'pairs:create',
  'pairs:update',
  'setups:list',
  'setups:create',
  'setups:update',
  'killzones:list',
  'killzones:create',
  'killzones:update',
  'paths:pickFolder',
  'paths:pickImages',
  'paths:openFile',
  'data:openFolder',
  'data:export',
  'data:exportPdf',
  'data:reset',
  'rules:evaluatePreTrade',
  'rules:evaluateModification',
  'rules:getSessionState',
  'rules:override',
  'rules:clearCooldown',
  'rules:onTradeClosed',
  'rules:detectCloseViolations',
  'rules:listAvailable',
  'accountRules:list',
  'accountRules:upsert',
  'sessions:getToday',
  'sessions:upsert',
  'sessions:lock',
  'trades:create',
  'trades:setOpen',
  'trades:close',
  'trades:closeMinimal',
  'trades:completePhase2',
  'trades:partialClose',
  'trades:list',
  'trades:listAwaitingReflection',
  'trades:countAwaitingReflection',
  'trades:get',
  'trades:delete',
  'trades:addScreenshot',
  'trades:pickScreenshots',
  'trades:listScreenshots',
  'trades:deleteScreenshot',
  'dashboard:getStats',
  'analytics:performance',
  'analytics:adherence',
  'analytics:setups',
  'analytics:behavioral',
  'analytics:phases',
  'analytics:derived',
  'analytics:listReviews',
  'analytics:createReview',
  'analytics:playbooks',
  'playbooks:list',
  'playbooks:get',
  'playbooks:create',
  'playbooks:update',
  'playbooks:delete',
  'backup:getSettings',
  'backup:setSettings',
  'backup:pickFolder',
  'backup:now',
  'backup:nowToFolder',
  'backup:getLog',
  'backup:pickRestoreFile',
  'backup:restore',
  'backup:reschedule',
  'insights:list',
  'insights:dismiss',
  'notebook:list',
  'notebook:search',
  'notebook:get',
  'notebook:create',
  'notebook:update',
  'notebook:delete',
  'import:previewMt5',
  'import:commitMt5',
  'import:previewCtrader',
  'import:commitCtrader',
  'import:previewTradingView',
  'import:commitTradingView',
  'sync:now',
  'sync:status',
  'sync:conflicts:list',
  'sync:conflicts:count',
  'sync:conflicts:resolve',
  'vault:status',
  'vault:unlock',
  'vault:recover',
  'vault:lock',
  'broker:status',
  'broker:getMt5Config',
  'broker:getCtraderConfig',
  'broker:ctraderConnect',
  'broker:ctraderDisconnect',
  'broker:ctraderSetEnvironment',
  'broker:listAccountMap',
  'broker:listUnmappedAccounts',
  'broker:setAccountMap',
  'broker:deleteAccountMap',
  'broker:diagnostics',
  'auth:signup',
  'auth:login',
  'auth:logout',
  'auth:getSession',
  'auth:restore',
  'auth:verifyEmail',
  'auth:forgotPassword',
  'auth:resetPassword',
  'billing:status',
  'billing:checkout',
  'billing:portal',
  'billing:cancel',
] as const satisfies readonly (keyof Procedures)[]

// Compile-time exhaustiveness check: every key of `Procedures` must appear in
// `PROCEDURE_NAMES` (and vice versa, enforced by the `satisfies` clause above).
type _MissingFromProcedureNames = Exclude<keyof Procedures, (typeof PROCEDURE_NAMES)[number]>
const _allProceduresCovered: [_MissingFromProcedureNames] extends [never]
  ? true
  : [missing: _MissingFromProcedureNames] = true
void _allProceduresCovered
