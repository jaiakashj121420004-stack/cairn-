import { contextBridge, ipcRenderer } from 'electron'
import type { DbStatus } from './ipc/db'
import type { SyncNowResult, SyncStatusResult } from './ipc/sync'
import type { ConflictDTO } from './ipc/sync-conflicts'
import type { VaultStatus } from './ipc/vault'
import type { PublicSession } from './services/session'
import type { UnlockVaultResult } from './services/session/store'
import type { IpcResponse } from '../shared/types/index'
import type {
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
} from '../shared/types/index'
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
  Playbook,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  TradeFilter,
  CreateTradeInput,
  CloseTradeInput,
  CloseMinimalInput,
  CompletePhase2Input,
  PartialCloseInput,
  DashboardStats,
  AnalyticsFilter,
  PerformanceStats,
  PlaybookStats,
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
} from '../shared/types/index'
import type {
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
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  CheckoutInputBody,
  CancelInputBody,
  BillingStatusOutput,
  CheckoutOutput,
  CancelOutput,
} from '@cairn/shared-zod'

// ── cairn:event push channel ─────────────────────────────────────────────────
// Main process sends { name, payload } after every DB-mutating trade operation.
// Fan-out to per-name listener sets so renderer components subscribe without
// coupling to specific IPC call-sites.
const eventListeners = new Map<string, Set<(payload: unknown) => void>>()

ipcRenderer.on('cairn:event', (_e, event: { name: string; payload: unknown }) => {
  eventListeners.get(event.name)?.forEach((cb) => cb(event.payload))
})

const api = {
  ping: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('ping'),
  dbStatus: (): Promise<IpcResponse<DbStatus>> => ipcRenderer.invoke('db:status'),

  settings: {
    get: (key: string): Promise<IpcResponse<string | null>> =>
      ipcRenderer.invoke('settings:get', { key }),
    set: (key: string, value: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('settings:set', { key, value }),
  },

  propFirms: {
    list: (): Promise<IpcResponse<PropFirm[]>> => ipcRenderer.invoke('propFirms:list'),
    create: (input: CreatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      ipcRenderer.invoke('propFirms:create', input),
    update: (input: UpdatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      ipcRenderer.invoke('propFirms:update', input),
  },

  accountTemplates: {
    list: (): Promise<IpcResponse<AccountTemplate[]>> =>
      ipcRenderer.invoke('accountTemplates:list'),
    create: (input: CreateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      ipcRenderer.invoke('accountTemplates:create', input),
    update: (input: UpdateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      ipcRenderer.invoke('accountTemplates:update', input),
  },

  accounts: {
    list: (): Promise<IpcResponse<Account[]>> => ipcRenderer.invoke('accounts:list'),
    create: (input: CreateAccountInput): Promise<IpcResponse<Account>> =>
      ipcRenderer.invoke('accounts:create', input),
    update: (input: UpdateAccountInput): Promise<IpcResponse<Account>> =>
      ipcRenderer.invoke('accounts:update', input),
    stats: (): Promise<IpcResponse<AccountStats[]>> => ipcRenderer.invoke('accounts:stats'),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('accounts:delete', { id }),
    advancePhase: (input: AdvancePhaseInput): Promise<IpcResponse<Account>> =>
      ipcRenderer.invoke('accounts:advancePhase', input),
    updatePhases: (input: UpdateAccountPhasesInput): Promise<IpcResponse<Account>> =>
      ipcRenderer.invoke('accounts:updatePhases', input),
  },

  pairs: {
    list: (): Promise<IpcResponse<Pair[]>> => ipcRenderer.invoke('pairs:list'),
    create: (input: CreatePairInput): Promise<IpcResponse<Pair>> =>
      ipcRenderer.invoke('pairs:create', input),
    update: (input: UpdatePairInput): Promise<IpcResponse<Pair>> =>
      ipcRenderer.invoke('pairs:update', input),
  },

  setups: {
    list: (): Promise<IpcResponse<Setup[]>> => ipcRenderer.invoke('setups:list'),
    create: (input: CreateSetupInput): Promise<IpcResponse<Setup>> =>
      ipcRenderer.invoke('setups:create', input),
    update: (input: UpdateSetupInput): Promise<IpcResponse<Setup>> =>
      ipcRenderer.invoke('setups:update', input),
  },

  killzones: {
    list: (): Promise<IpcResponse<Killzone[]>> => ipcRenderer.invoke('killzones:list'),
    create: (input: CreateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      ipcRenderer.invoke('killzones:create', input),
    update: (input: UpdateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      ipcRenderer.invoke('killzones:update', input),
  },

  paths: {
    pickFolder: (): Promise<IpcResponse<string | null>> => ipcRenderer.invoke('paths:pickFolder'),
    pickImages: (): Promise<IpcResponse<string[]>> => ipcRenderer.invoke('paths:pickImages'),
    openFile: (filePath: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('paths:openFile', { filePath }),
  },

  data: {
    openFolder: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('data:openFolder'),
    export: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('data:export'),
    exportPdf: (defaultName?: string): Promise<IpcResponse<string>> =>
      ipcRenderer.invoke('data:exportPdf', { defaultName }),
    reset: (ack: string): Promise<IpcResponse<void>> => ipcRenderer.invoke('data:reset', { ack }),
  },

  rules: {
    evaluatePreTrade: (input: DraftTradeInput): Promise<IpcResponse<RuleEvaluationDTO[]>> =>
      ipcRenderer.invoke('rules:evaluatePreTrade', input),
    evaluateModification: (
      input: EvaluateModificationInput,
    ): Promise<IpcResponse<RuleEvaluationDTO[]>> =>
      ipcRenderer.invoke('rules:evaluateModification', input),
    getSessionState: (accountId: string): Promise<IpcResponse<SessionStateDTO>> =>
      ipcRenderer.invoke('rules:getSessionState', { accountId }),
    override: (input: OverrideInputDTO): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('rules:override', input),
    clearCooldown: (id: string, ack: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('rules:clearCooldown', { id, ack }),
    onTradeClosed: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('rules:onTradeClosed', { tradeId }),
    detectCloseViolations: (tradeId: string): Promise<IpcResponse<CloseDetectionDTO[]>> =>
      ipcRenderer.invoke('rules:detectCloseViolations', { tradeId }),
    listAvailable: (): Promise<
      IpcResponse<
        Array<{
          key: string
          label: string
          description: string
          category: string
          severity: string
          isHardLock: boolean
        }>
      >
    > => ipcRenderer.invoke('rules:listAvailable'),
  },

  accountRules: {
    list: (accountId: string): Promise<IpcResponse<AccountRuleConfigDTO[]>> =>
      ipcRenderer.invoke('accountRules:list', { accountId }),
    upsert: (input: UpsertAccountRuleInput): Promise<IpcResponse<AccountRuleConfigDTO>> =>
      ipcRenderer.invoke('accountRules:upsert', input),
  },

  sessions: {
    getToday: (accountId: string): Promise<IpcResponse<Session | null>> =>
      ipcRenderer.invoke('sessions:getToday', { accountId }),
    upsert: (input: CreateSessionInput): Promise<IpcResponse<Session>> =>
      ipcRenderer.invoke('sessions:upsert', input),
    lock: (sessionId: string): Promise<IpcResponse<Session>> =>
      ipcRenderer.invoke('sessions:lock', { sessionId }),
  },

  trades: {
    create: (input: CreateTradeInput): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:create', input),
    setOpen: (tradeId: string, accountId: string): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:setOpen', { tradeId, accountId }),
    close: (input: CloseTradeInput): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:close', input),
    closeMinimal: (input: CloseMinimalInput): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:closeMinimal', input),
    completePhase2: (input: CompletePhase2Input): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:completePhase2', input),
    partialClose: (input: PartialCloseInput): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:partialClose', input),
    list: (filter: TradeFilter): Promise<IpcResponse<TradeListItem[]>> =>
      ipcRenderer.invoke('trades:list', filter),
    listAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<TradeListItem[]>> =>
      ipcRenderer.invoke('trades:listAwaitingReflection', { accountId: accountId ?? null }),
    countAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<number>> =>
      ipcRenderer.invoke('trades:countAwaitingReflection', { accountId: accountId ?? null }),
    get: (tradeId: string): Promise<IpcResponse<TradeDetail>> =>
      ipcRenderer.invoke('trades:get', { tradeId }),
    delete: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('trades:delete', { tradeId }),
    addScreenshot: (
      tradeId: string,
      kind: string,
      sourcePath: string,
      caption?: string,
    ): Promise<IpcResponse<TradeScreenshot>> =>
      ipcRenderer.invoke('trades:addScreenshot', { tradeId, kind, sourcePath, caption }),
    pickScreenshots: (tradeId: string): Promise<IpcResponse<string[]>> =>
      ipcRenderer.invoke('trades:pickScreenshots', { tradeId }),
    listScreenshots: (tradeId: string): Promise<IpcResponse<TradeScreenshot[]>> =>
      ipcRenderer.invoke('trades:listScreenshots', { tradeId }),
    deleteScreenshot: (screenshotId: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('trades:deleteScreenshot', { screenshotId }),
  },
  dashboard: {
    getStats: (accountId: string): Promise<IpcResponse<DashboardStats>> =>
      ipcRenderer.invoke('dashboard:getStats', { accountId }),
  },
  analytics: {
    performance: (filter: AnalyticsFilter): Promise<IpcResponse<PerformanceStats>> =>
      ipcRenderer.invoke('analytics:performance', { filter }),
    adherence: (filter: AnalyticsFilter): Promise<IpcResponse<RuleAdherenceStats>> =>
      ipcRenderer.invoke('analytics:adherence', { filter }),
    setups: (filter: AnalyticsFilter): Promise<IpcResponse<SetupPerformanceStats>> =>
      ipcRenderer.invoke('analytics:setups', { filter }),
    behavioral: (filter: AnalyticsFilter): Promise<IpcResponse<BehavioralStats>> =>
      ipcRenderer.invoke('analytics:behavioral', { filter }),
    phases: (): Promise<IpcResponse<AccountsPhaseStats>> => ipcRenderer.invoke('analytics:phases'),
    derived: (filter: AnalyticsFilter): Promise<IpcResponse<DerivedStats>> =>
      ipcRenderer.invoke('analytics:derived', { filter }),
    listReviews: (accountId?: string | null): Promise<IpcResponse<ReviewSummary[]>> =>
      ipcRenderer.invoke('analytics:listReviews', { accountId: accountId ?? null }),
    createReview: (input: CreateReviewInput): Promise<IpcResponse<ReviewSummary>> =>
      ipcRenderer.invoke('analytics:createReview', input),
    playbookStats: (filter: AnalyticsFilter): Promise<IpcResponse<PlaybookStats>> =>
      ipcRenderer.invoke('analytics:playbooks', { filter }),
  },
  playbooks: {
    list: (accountId: string): Promise<IpcResponse<Playbook[]>> =>
      ipcRenderer.invoke('playbooks:list', { accountId }),
    get: (id: string): Promise<IpcResponse<Playbook>> =>
      ipcRenderer.invoke('playbooks:get', { id }),
    create: (input: CreatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      ipcRenderer.invoke('playbooks:create', input),
    update: (input: UpdatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      ipcRenderer.invoke('playbooks:update', input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('playbooks:delete', { id }),
  },
  backup: {
    getSettings: (): Promise<IpcResponse<BackupSettings>> =>
      ipcRenderer.invoke('backup:getSettings'),
    setSettings: (s: Partial<BackupSettings>): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('backup:setSettings', s),
    pickFolder: (): Promise<IpcResponse<string | null>> => ipcRenderer.invoke('backup:pickFolder'),
    now: (): Promise<IpcResponse<BackupResult>> => ipcRenderer.invoke('backup:now'),
    nowToFolder: (): Promise<IpcResponse<BackupResult>> => ipcRenderer.invoke('backup:nowToFolder'),
    getLog: (): Promise<IpcResponse<BackupLogEntry[]>> => ipcRenderer.invoke('backup:getLog'),
    pickRestoreFile: (): Promise<IpcResponse<RestoreInfo & { path: string }>> =>
      ipcRenderer.invoke('backup:pickRestoreFile'),
    restore: (path: string, ack: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('backup:restore', { path, ack }),
    reschedule: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('backup:reschedule'),
  },

  insights: {
    list: (accountId: string): Promise<IpcResponse<Insight[]>> =>
      ipcRenderer.invoke('insights:list', { accountId }),
    dismiss: (accountId: string, insightId: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('insights:dismiss', { accountId, insightId }),
  },

  notebook: {
    list: (): Promise<IpcResponse<NotebookEntrySummary[]>> => ipcRenderer.invoke('notebook:list'),
    search: (input: NotebookSearchInput): Promise<IpcResponse<NotebookEntrySummary[]>> =>
      ipcRenderer.invoke('notebook:search', input),
    get: (id: string): Promise<IpcResponse<NotebookEntry>> =>
      ipcRenderer.invoke('notebook:get', { id }),
    create: (input: CreateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      ipcRenderer.invoke('notebook:create', input),
    update: (input: UpdateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      ipcRenderer.invoke('notebook:update', input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      ipcRenderer.invoke('notebook:delete', { id }),
  },

  import: {
    previewMt5: (input: Mt5PreviewInput): Promise<IpcResponse<ImportPreview>> =>
      ipcRenderer.invoke('import:previewMt5', input),
    commitMt5: (input: Mt5CommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      ipcRenderer.invoke('import:commitMt5', input),
    previewCtrader: (input: CTraderPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      ipcRenderer.invoke('import:previewCtrader', input),
    commitCtrader: (input: CTraderCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      ipcRenderer.invoke('import:commitCtrader', input),
    previewTradingView: (input: TvPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      ipcRenderer.invoke('import:previewTradingView', input),
    commitTradingView: (input: TvCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      ipcRenderer.invoke('import:commitTradingView', input),
  },

  sync: {
    // Manual sync trigger (spec shorthand: cairn.sync.now()).
    now: (): Promise<IpcResponse<SyncNowResult>> => ipcRenderer.invoke('sync:now'),
    status: (): Promise<IpcResponse<SyncStatusResult>> => ipcRenderer.invoke('sync:status'),
    listConflicts: (): Promise<IpcResponse<ConflictDTO[]>> =>
      ipcRenderer.invoke('sync:conflicts:list'),
    countConflicts: (): Promise<IpcResponse<number>> => ipcRenderer.invoke('sync:conflicts:count'),
    resolveConflict: (input: {
      conflictId: number
      winner: 'local' | 'remote'
    }): Promise<IpcResponse<{ ok: true }>> => ipcRenderer.invoke('sync:conflicts:resolve', input),
  },

  vault: {
    status: (): Promise<IpcResponse<VaultStatus>> => ipcRenderer.invoke('vault:status'),
    unlock: (password: string): Promise<IpcResponse<UnlockVaultResult>> =>
      ipcRenderer.invoke('vault:unlock', { password }),
    recover: (
      phrase: readonly string[],
      newPassword: string,
    ): Promise<IpcResponse<UnlockVaultResult>> =>
      ipcRenderer.invoke('vault:recover', { phrase, newPassword }),
    lock: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('vault:lock'),
  },

  broker: {
    status: (): Promise<IpcResponse<BrokerStatus>> => ipcRenderer.invoke('broker:status'),
    getMt5Config: (): Promise<IpcResponse<Mt5BridgeConfig>> =>
      ipcRenderer.invoke('broker:getMt5Config'),
    getCtraderConfig: (): Promise<IpcResponse<CtraderRuntimeConfig>> =>
      ipcRenderer.invoke('broker:getCtraderConfig'),
    ctraderConnect: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('broker:ctraderConnect'),
    ctraderDisconnect: (): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('broker:ctraderDisconnect'),
    ctraderSetEnvironment: (env: CtraderEnvironment): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('broker:ctraderSetEnvironment', env),
    listAccountMap: (): Promise<IpcResponse<BrokerAccountMapEntry[]>> =>
      ipcRenderer.invoke('broker:listAccountMap'),
    listUnmappedAccounts: (): Promise<IpcResponse<UnmappedBrokerAccount[]>> =>
      ipcRenderer.invoke('broker:listUnmappedAccounts'),
    setAccountMap: (input: {
      broker: BrokerKind
      brokerAccountId: string
      cairnAccountId: string
    }): Promise<IpcResponse<BrokerAccountMapEntry>> =>
      ipcRenderer.invoke('broker:setAccountMap', input),
    deleteAccountMap: (input: {
      broker: BrokerKind
      brokerAccountId: string
    }): Promise<IpcResponse<void>> => ipcRenderer.invoke('broker:deleteAccountMap', input),
    diagnostics: (): Promise<IpcResponse<BrokerDiagnostics>> =>
      ipcRenderer.invoke('broker:diagnostics'),
  },

  auth: {
    signup: (input: SignupInput): Promise<IpcResponse<SignupResult>> =>
      ipcRenderer.invoke('auth:signup', input),
    login: (input: LoginInput): Promise<IpcResponse<PublicSession>> =>
      ipcRenderer.invoke('auth:login', input),
    logout: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('auth:logout'),
    getSession: (): Promise<IpcResponse<PublicSession | null>> =>
      ipcRenderer.invoke('auth:getSession'),
    restore: (): Promise<IpcResponse<PublicSession | null>> => ipcRenderer.invoke('auth:restore'),
    verifyEmail: (token: string): Promise<IpcResponse<{ verified: boolean }>> =>
      ipcRenderer.invoke('auth:verifyEmail', { token }),
    forgotPassword: (input: ForgotPasswordInput): Promise<IpcResponse<{ sent: true }>> =>
      ipcRenderer.invoke('auth:forgotPassword', input),
    resetPassword: (input: ResetPasswordInput): Promise<IpcResponse<{ reset: true }>> =>
      ipcRenderer.invoke('auth:resetPassword', input),
  },

  billing: {
    status: (): Promise<IpcResponse<BillingStatusOutput>> => ipcRenderer.invoke('billing:status'),
    checkout: (input: CheckoutInputBody): Promise<IpcResponse<CheckoutOutput>> =>
      ipcRenderer.invoke('billing:checkout', input),
    portal: (): Promise<IpcResponse<CheckoutOutput>> => ipcRenderer.invoke('billing:portal'),
    cancel: (input: CancelInputBody): Promise<IpcResponse<CancelOutput>> =>
      ipcRenderer.invoke('billing:cancel', input),
  },

  events: {
    on: (name: string, cb: (payload: unknown) => void): (() => void) => {
      let set = eventListeners.get(name)
      if (!set) {
        set = new Set()
        eventListeners.set(name, set)
      }
      set.add(cb)
      return () => {
        eventListeners.get(name)?.delete(cb)
      }
    },
    off: (name: string, cb: (payload: unknown) => void): void => {
      eventListeners.get(name)?.delete(cb)
    },
  },
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
