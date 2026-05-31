import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '../shared/types/index'

// ── cairn:event push channel ─────────────────────────────────────────────────
// Main process sends { name, payload } after every DB-mutating trade operation.
// Fan-out to per-name listener sets so renderer components subscribe without
// coupling to specific IPC call-sites.
const eventListeners = new Map<string, Set<(payload: unknown) => void>>()

ipcRenderer.on('cairn:event', (_e, event: { name: string; payload: unknown }) => {
  eventListeners.get(event.name)?.forEach((cb) => cb(event.payload))
})
import type { DbStatus } from './ipc/db'
import type {
  BackupLogEntry,
  BackupResult,
  RestoreInfo,
  BackupSettings,
  Mt5ImportPreview,
  Mt5CommitResult,
  Mt5PreviewInput,
  Mt5CommitInput,
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
  CreateTradeInput,
  CloseTradeInput,
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
} from '../shared/types/index'

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
    openFile: (filePath: string): Promise<IpcResponse<void>> => ipcRenderer.invoke('paths:openFile', { filePath }),
  },

  data: {
    openFolder: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('data:openFolder'),
    export: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('data:export'),
    exportPdf: (defaultName?: string): Promise<IpcResponse<string>> => ipcRenderer.invoke('data:exportPdf', { defaultName }),
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
    partialClose: (input: PartialCloseInput): Promise<IpcResponse<Trade>> =>
      ipcRenderer.invoke('trades:partialClose', input),
    list: (filter: TradeFilter): Promise<IpcResponse<TradeListItem[]>> =>
      ipcRenderer.invoke('trades:list', filter),
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
    phases: (): Promise<IpcResponse<AccountsPhaseStats>> =>
      ipcRenderer.invoke('analytics:phases'),
    derived: (filter: AnalyticsFilter): Promise<IpcResponse<DerivedStats>> =>
      ipcRenderer.invoke('analytics:derived', { filter }),
    listReviews: (accountId?: string | null): Promise<IpcResponse<ReviewSummary[]>> =>
      ipcRenderer.invoke('analytics:listReviews', { accountId: accountId ?? null }),
    createReview: (input: CreateReviewInput): Promise<IpcResponse<ReviewSummary>> =>
      ipcRenderer.invoke('analytics:createReview', input),
  },
  backup: {
    getSettings: (): Promise<IpcResponse<BackupSettings>> =>
      ipcRenderer.invoke('backup:getSettings'),
    setSettings: (s: Partial<BackupSettings>): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('backup:setSettings', s),
    pickFolder: (): Promise<IpcResponse<string | null>> =>
      ipcRenderer.invoke('backup:pickFolder'),
    now: (): Promise<IpcResponse<BackupResult>> =>
      ipcRenderer.invoke('backup:now'),
    nowToFolder: (): Promise<IpcResponse<BackupResult>> =>
      ipcRenderer.invoke('backup:nowToFolder'),
    getLog: (): Promise<IpcResponse<BackupLogEntry[]>> =>
      ipcRenderer.invoke('backup:getLog'),
    pickRestoreFile: (): Promise<IpcResponse<RestoreInfo & { path: string }>> =>
      ipcRenderer.invoke('backup:pickRestoreFile'),
    restore: (path: string, ack: string): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('backup:restore', { path, ack }),
    reschedule: (): Promise<IpcResponse<void>> =>
      ipcRenderer.invoke('backup:reschedule'),
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
    previewMt5: (input: Mt5PreviewInput): Promise<IpcResponse<Mt5ImportPreview>> =>
      ipcRenderer.invoke('import:previewMt5', input),
    commitMt5: (input: Mt5CommitInput): Promise<IpcResponse<Mt5CommitResult>> =>
      ipcRenderer.invoke('import:commitMt5', input),
  },

  events: {
    on: (name: string, cb: (payload: unknown) => void): (() => void) => {
      let set = eventListeners.get(name)
      if (!set) { set = new Set(); eventListeners.set(name, set) }
      set.add(cb)
      return () => { eventListeners.get(name)?.delete(cb) }
    },
    off: (name: string, cb: (payload: unknown) => void): void => {
      eventListeners.get(name)?.delete(cb)
    },
  },
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
