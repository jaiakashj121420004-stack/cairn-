import type { IpcResponse } from '@shared/types/index'
import type {
  DbStatus,
  VaultStatus,
  UnlockVaultResult,
  SyncNowResult,
  SyncStatusResult,
  ConflictDTO,
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
} from '@shared/types/index'
import { transport } from './transport'
import type {
  PublicSession,
  SignupResult,
  BrokerAccountMapEntry,
  BrokerDiagnostics,
  BrokerKind,
  BrokerStatus,
  Mt5BridgeConfig,
  Mt5EaInstallResult,
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

declare global {
  interface Window {
    api: {
      ping: () => Promise<IpcResponse<string>>
      dbStatus: () => Promise<IpcResponse<DbStatus>>
      settings: {
        get: (key: string) => Promise<IpcResponse<string | null>>
        set: (key: string, value: string) => Promise<IpcResponse<void>>
      }
      propFirms: {
        list: () => Promise<IpcResponse<PropFirm[]>>
        create: (input: CreatePropFirmInput) => Promise<IpcResponse<PropFirm>>
        update: (input: UpdatePropFirmInput) => Promise<IpcResponse<PropFirm>>
      }
      accountTemplates: {
        list: () => Promise<IpcResponse<AccountTemplate[]>>
        create: (input: CreateAccountTemplateInput) => Promise<IpcResponse<AccountTemplate>>
        update: (input: UpdateAccountTemplateInput) => Promise<IpcResponse<AccountTemplate>>
      }
      accounts: {
        list: () => Promise<IpcResponse<Account[]>>
        create: (input: CreateAccountInput) => Promise<IpcResponse<Account>>
        update: (input: UpdateAccountInput) => Promise<IpcResponse<Account>>
        stats: () => Promise<IpcResponse<AccountStats[]>>
        delete: (id: string) => Promise<IpcResponse<{ ok: true }>>
        advancePhase: (input: AdvancePhaseInput) => Promise<IpcResponse<Account>>
        updatePhases: (input: UpdateAccountPhasesInput) => Promise<IpcResponse<Account>>
      }
      pairs: {
        list: () => Promise<IpcResponse<Pair[]>>
        create: (input: CreatePairInput) => Promise<IpcResponse<Pair>>
        update: (input: UpdatePairInput) => Promise<IpcResponse<Pair>>
      }
      setups: {
        list: () => Promise<IpcResponse<Setup[]>>
        create: (input: CreateSetupInput) => Promise<IpcResponse<Setup>>
        update: (input: UpdateSetupInput) => Promise<IpcResponse<Setup>>
      }
      killzones: {
        list: () => Promise<IpcResponse<Killzone[]>>
        create: (input: CreateKillzoneInput) => Promise<IpcResponse<Killzone>>
        update: (input: UpdateKillzoneInput) => Promise<IpcResponse<Killzone>>
      }
      paths: {
        pickFolder: () => Promise<IpcResponse<string | null>>
        pickImages: () => Promise<IpcResponse<string[]>>
        openFile: (filePath: string) => Promise<IpcResponse<void>>
      }
      data: {
        openFolder: () => Promise<IpcResponse<void>>
        export: () => Promise<IpcResponse<string>>
        exportPdf: (defaultName?: string) => Promise<IpcResponse<string>>
        reset: (ack: string) => Promise<IpcResponse<void>>
      }
      rules: {
        evaluatePreTrade: (input: DraftTradeInput) => Promise<IpcResponse<RuleEvaluationDTO[]>>
        evaluateModification: (
          input: EvaluateModificationInput,
        ) => Promise<IpcResponse<RuleEvaluationDTO[]>>
        getSessionState: (accountId: string) => Promise<IpcResponse<SessionStateDTO>>
        override: (input: OverrideInputDTO) => Promise<IpcResponse<{ ok: true }>>
        clearCooldown: (id: string, ack: string) => Promise<IpcResponse<{ ok: true }>>
        onTradeClosed: (tradeId: string) => Promise<IpcResponse<{ ok: true }>>
        detectCloseViolations: (tradeId: string) => Promise<IpcResponse<CloseDetectionDTO[]>>
        listAvailable: () => Promise<
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
        >
      }
      accountRules: {
        list: (accountId: string) => Promise<IpcResponse<AccountRuleConfigDTO[]>>
        upsert: (input: UpsertAccountRuleInput) => Promise<IpcResponse<AccountRuleConfigDTO>>
      }
      sessions: {
        getToday: (accountId: string) => Promise<IpcResponse<Session | null>>
        upsert: (input: CreateSessionInput) => Promise<IpcResponse<Session>>
        lock: (sessionId: string) => Promise<IpcResponse<Session>>
      }
      trades: {
        create: (input: CreateTradeInput) => Promise<IpcResponse<Trade>>
        setOpen: (tradeId: string, accountId: string) => Promise<IpcResponse<Trade>>
        close: (input: CloseTradeInput) => Promise<IpcResponse<Trade>>
        closeMinimal: (input: CloseMinimalInput) => Promise<IpcResponse<Trade>>
        completePhase2: (input: CompletePhase2Input) => Promise<IpcResponse<Trade>>
        partialClose: (input: PartialCloseInput) => Promise<IpcResponse<Trade>>
        list: (filter: TradeFilter) => Promise<IpcResponse<TradeListItem[]>>
        listAwaitingReflection: (accountId?: string | null) => Promise<IpcResponse<TradeListItem[]>>
        countAwaitingReflection: (accountId?: string | null) => Promise<IpcResponse<number>>
        get: (tradeId: string) => Promise<IpcResponse<TradeDetail>>
        delete: (tradeId: string) => Promise<IpcResponse<{ ok: true }>>
        addScreenshot: (
          tradeId: string,
          kind: string,
          sourcePath: string,
          caption?: string,
        ) => Promise<IpcResponse<TradeScreenshot>>
        pickScreenshots: (tradeId: string) => Promise<IpcResponse<string[]>>
        listScreenshots: (tradeId: string) => Promise<IpcResponse<TradeScreenshot[]>>
        deleteScreenshot: (screenshotId: string) => Promise<IpcResponse<{ ok: true }>>
      }
      dashboard: {
        getStats: (accountId: string) => Promise<IpcResponse<DashboardStats>>
      }
      analytics: {
        performance: (filter: AnalyticsFilter) => Promise<IpcResponse<PerformanceStats>>
        adherence: (filter: AnalyticsFilter) => Promise<IpcResponse<RuleAdherenceStats>>
        setups: (filter: AnalyticsFilter) => Promise<IpcResponse<SetupPerformanceStats>>
        behavioral: (filter: AnalyticsFilter) => Promise<IpcResponse<BehavioralStats>>
        phases: () => Promise<IpcResponse<AccountsPhaseStats>>
        derived: (filter: AnalyticsFilter) => Promise<IpcResponse<DerivedStats>>
        listReviews: (accountId?: string | null) => Promise<IpcResponse<ReviewSummary[]>>
        createReview: (input: CreateReviewInput) => Promise<IpcResponse<ReviewSummary>>
        playbookStats: (filter: AnalyticsFilter) => Promise<IpcResponse<PlaybookStats>>
      }
      playbooks: {
        list: (accountId: string) => Promise<IpcResponse<Playbook[]>>
        get: (id: string) => Promise<IpcResponse<Playbook>>
        create: (input: CreatePlaybookInput) => Promise<IpcResponse<Playbook>>
        update: (input: UpdatePlaybookInput) => Promise<IpcResponse<Playbook>>
        delete: (id: string) => Promise<IpcResponse<{ ok: true }>>
      }
      backup: {
        getSettings: () => Promise<IpcResponse<BackupSettings>>
        setSettings: (s: Partial<BackupSettings>) => Promise<IpcResponse<void>>
        pickFolder: () => Promise<IpcResponse<string | null>>
        now: () => Promise<IpcResponse<BackupResult>>
        nowToFolder: () => Promise<IpcResponse<BackupResult>>
        getLog: () => Promise<IpcResponse<BackupLogEntry[]>>
        pickRestoreFile: () => Promise<IpcResponse<RestoreInfo & { path: string }>>
        restore: (path: string, ack: string) => Promise<IpcResponse<void>>
        reschedule: () => Promise<IpcResponse<void>>
      }
      insights: {
        list: (accountId: string) => Promise<IpcResponse<Insight[]>>
        dismiss: (accountId: string, insightId: string) => Promise<IpcResponse<void>>
      }
      notebook: {
        list: () => Promise<IpcResponse<NotebookEntrySummary[]>>
        search: (input: NotebookSearchInput) => Promise<IpcResponse<NotebookEntrySummary[]>>
        get: (id: string) => Promise<IpcResponse<NotebookEntry>>
        create: (input: CreateNotebookEntryInput) => Promise<IpcResponse<NotebookEntry>>
        update: (input: UpdateNotebookEntryInput) => Promise<IpcResponse<NotebookEntry>>
        delete: (id: string) => Promise<IpcResponse<{ ok: true }>>
      }
      import: {
        previewMt5: (input: Mt5PreviewInput) => Promise<IpcResponse<ImportPreview>>
        commitMt5: (input: Mt5CommitInput) => Promise<IpcResponse<ImportCommitResult>>
        previewCtrader: (input: CTraderPreviewInput) => Promise<IpcResponse<ImportPreview>>
        commitCtrader: (input: CTraderCommitInput) => Promise<IpcResponse<ImportCommitResult>>
        previewTradingView: (input: TvPreviewInput) => Promise<IpcResponse<ImportPreview>>
        commitTradingView: (input: TvCommitInput) => Promise<IpcResponse<ImportCommitResult>>
      }
      auth: {
        signup: (input: SignupInput) => Promise<IpcResponse<SignupResult>>
        login: (input: LoginInput) => Promise<IpcResponse<PublicSession>>
        logout: () => Promise<IpcResponse<void>>
        getSession: () => Promise<IpcResponse<PublicSession | null>>
        restore: () => Promise<IpcResponse<PublicSession | null>>
        verifyEmail: (token: string) => Promise<IpcResponse<{ verified: boolean }>>
        forgotPassword: (input: ForgotPasswordInput) => Promise<IpcResponse<{ sent: true }>>
        resetPassword: (input: ResetPasswordInput) => Promise<IpcResponse<{ reset: true }>>
      }
      vault: {
        status: () => Promise<IpcResponse<VaultStatus>>
        unlock: (password: string) => Promise<IpcResponse<UnlockVaultResult>>
        recover: (
          phrase: readonly string[],
          newPassword: string,
        ) => Promise<IpcResponse<UnlockVaultResult>>
        lock: () => Promise<IpcResponse<void>>
      }
      sync: {
        now: () => Promise<IpcResponse<SyncNowResult>>
        status: () => Promise<IpcResponse<SyncStatusResult>>
        listConflicts: () => Promise<IpcResponse<ConflictDTO[]>>
        countConflicts: () => Promise<IpcResponse<number>>
        resolveConflict: (input: {
          conflictId: number
          winner: 'local' | 'remote'
        }) => Promise<IpcResponse<{ ok: true }>>
      }
      broker: {
        status: () => Promise<IpcResponse<BrokerStatus>>
        getMt5Config: () => Promise<IpcResponse<Mt5BridgeConfig>>
        installMt5Ea: () => Promise<IpcResponse<Mt5EaInstallResult>>
        revealMt5Experts: (path: string) => Promise<IpcResponse<void>>
        getCtraderConfig: () => Promise<IpcResponse<CtraderRuntimeConfig>>
        ctraderConnect: () => Promise<IpcResponse<void>>
        ctraderDisconnect: () => Promise<IpcResponse<void>>
        ctraderSetEnvironment: (env: CtraderEnvironment) => Promise<IpcResponse<void>>
        setCtraderCredentials: (input: {
          clientId: string
          clientSecret: string
        }) => Promise<IpcResponse<void>>
        clearCtraderCredentials: () => Promise<IpcResponse<void>>
        listAccountMap: () => Promise<IpcResponse<BrokerAccountMapEntry[]>>
        listUnmappedAccounts: () => Promise<IpcResponse<UnmappedBrokerAccount[]>>
        setAccountMap: (input: {
          broker: BrokerKind
          brokerAccountId: string
          cairnAccountId: string
        }) => Promise<IpcResponse<BrokerAccountMapEntry>>
        deleteAccountMap: (input: {
          broker: BrokerKind
          brokerAccountId: string
        }) => Promise<IpcResponse<void>>
        diagnostics: () => Promise<IpcResponse<BrokerDiagnostics>>
      }
      billing: {
        status: () => Promise<IpcResponse<BillingStatusOutput>>
        checkout: (input: CheckoutInputBody) => Promise<IpcResponse<CheckoutOutput>>
        portal: () => Promise<IpcResponse<CheckoutOutput>>
        cancel: (input: CancelInputBody) => Promise<IpcResponse<CancelOutput>>
      }
      events: {
        on: (name: string, cb: (payload: unknown) => void) => () => void
        off: (name: string, cb: (payload: unknown) => void) => void
      }
    }
  }
}

export const ipc = {
  ping: (): Promise<IpcResponse<string>> => transport.call('ping', undefined),
  dbStatus: (): Promise<IpcResponse<DbStatus>> => transport.call('db:status', undefined),

  settings: {
    get: async <T>(key: string): Promise<IpcResponse<T | null>> => {
      const res = await transport.call('settings:get', { key })
      if (!res.ok) return res
      if (res.data === null) return { ok: true, data: null }
      try {
        return { ok: true, data: JSON.parse(res.data) as T }
      } catch {
        return {
          ok: false,
          error: { code: 'PARSE_ERROR', message: `Failed to parse setting: ${key}` },
        }
      }
    },
    set: <T>(key: string, value: T): Promise<IpcResponse<void>> =>
      transport.call('settings:set', { key, value: JSON.stringify(value) }),
  },

  propFirms: {
    list: (): Promise<IpcResponse<PropFirm[]>> => transport.call('propFirms:list', undefined),
    create: (input: CreatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      transport.call('propFirms:create', input),
    update: (input: UpdatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      transport.call('propFirms:update', input),
  },

  accountTemplates: {
    list: (): Promise<IpcResponse<AccountTemplate[]>> =>
      transport.call('accountTemplates:list', undefined),
    create: (input: CreateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      transport.call('accountTemplates:create', input),
    update: (input: UpdateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      transport.call('accountTemplates:update', input),
  },

  accounts: {
    list: (): Promise<IpcResponse<Account[]>> => transport.call('accounts:list', undefined),
    create: (input: CreateAccountInput): Promise<IpcResponse<Account>> =>
      transport.call('accounts:create', input),
    update: (input: UpdateAccountInput): Promise<IpcResponse<Account>> =>
      transport.call('accounts:update', input),
    stats: (): Promise<IpcResponse<AccountStats[]>> => transport.call('accounts:stats', undefined),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('accounts:delete', { id }),
    advancePhase: (input: AdvancePhaseInput): Promise<IpcResponse<Account>> =>
      transport.call('accounts:advancePhase', input),
    updatePhases: (input: UpdateAccountPhasesInput): Promise<IpcResponse<Account>> =>
      transport.call('accounts:updatePhases', input),
  },

  pairs: {
    list: (): Promise<IpcResponse<Pair[]>> => transport.call('pairs:list', undefined),
    create: (input: CreatePairInput): Promise<IpcResponse<Pair>> =>
      transport.call('pairs:create', input),
    update: (input: UpdatePairInput): Promise<IpcResponse<Pair>> =>
      transport.call('pairs:update', input),
  },

  setups: {
    list: (): Promise<IpcResponse<Setup[]>> => transport.call('setups:list', undefined),
    create: (input: CreateSetupInput): Promise<IpcResponse<Setup>> =>
      transport.call('setups:create', input),
    update: (input: UpdateSetupInput): Promise<IpcResponse<Setup>> =>
      transport.call('setups:update', input),
  },

  killzones: {
    list: (): Promise<IpcResponse<Killzone[]>> => transport.call('killzones:list', undefined),
    create: (input: CreateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      transport.call('killzones:create', input),
    update: (input: UpdateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      transport.call('killzones:update', input),
  },

  data: {
    openFolder: (): Promise<IpcResponse<void>> => transport.call('data:openFolder', undefined),
    export: (): Promise<IpcResponse<string>> => transport.call('data:export', undefined),
    exportPdf: (defaultName?: string): Promise<IpcResponse<string>> =>
      transport.call('data:exportPdf', { defaultName }),
    reset: (ack: string): Promise<IpcResponse<void>> => transport.call('data:reset', { ack }),
  },

  paths: {
    pickFolder: (): Promise<IpcResponse<string | null>> =>
      transport.call('paths:pickFolder', undefined),
    pickImages: (): Promise<IpcResponse<string[]>> => transport.call('paths:pickImages', undefined),
    openFile: (filePath: string): Promise<IpcResponse<void>> =>
      transport.call('paths:openFile', { filePath }),
  },

  rules: {
    evaluatePreTrade: (input: DraftTradeInput): Promise<IpcResponse<RuleEvaluationDTO[]>> =>
      transport.call('rules:evaluatePreTrade', input),
    evaluateModification: (
      input: EvaluateModificationInput,
    ): Promise<IpcResponse<RuleEvaluationDTO[]>> =>
      transport.call('rules:evaluateModification', input),
    getSessionState: (accountId: string): Promise<IpcResponse<SessionStateDTO>> =>
      transport.call('rules:getSessionState', { accountId }),
    override: (input: OverrideInputDTO): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('rules:override', input),
    clearCooldown: (id: string, ack: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('rules:clearCooldown', { id, ack }),
    onTradeClosed: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('rules:onTradeClosed', { tradeId }),
    detectCloseViolations: (tradeId: string): Promise<IpcResponse<CloseDetectionDTO[]>> =>
      transport.call('rules:detectCloseViolations', { tradeId }),
    listAvailable: () => transport.call('rules:listAvailable', undefined),
  },

  accountRules: {
    list: (accountId: string): Promise<IpcResponse<AccountRuleConfigDTO[]>> =>
      transport.call('accountRules:list', { accountId }),
    upsert: (input: UpsertAccountRuleInput): Promise<IpcResponse<AccountRuleConfigDTO>> =>
      transport.call('accountRules:upsert', input),
  },

  sessions: {
    getToday: (accountId: string): Promise<IpcResponse<Session | null>> =>
      transport.call('sessions:getToday', { accountId }),
    upsert: (input: CreateSessionInput): Promise<IpcResponse<Session>> =>
      transport.call('sessions:upsert', input),
    lock: (sessionId: string): Promise<IpcResponse<Session>> =>
      transport.call('sessions:lock', { sessionId }),
  },

  trades: {
    create: (input: CreateTradeInput): Promise<IpcResponse<Trade>> =>
      transport.call('trades:create', input),
    setOpen: (tradeId: string, accountId: string): Promise<IpcResponse<Trade>> =>
      transport.call('trades:setOpen', { tradeId, accountId }),
    close: (input: CloseTradeInput): Promise<IpcResponse<Trade>> =>
      transport.call('trades:close', input),
    closeMinimal: (input: CloseMinimalInput): Promise<IpcResponse<Trade>> =>
      transport.call('trades:closeMinimal', input),
    completePhase2: (input: CompletePhase2Input): Promise<IpcResponse<Trade>> =>
      transport.call('trades:completePhase2', input),
    partialClose: (input: PartialCloseInput): Promise<IpcResponse<Trade>> =>
      transport.call('trades:partialClose', input),
    list: (filter: TradeFilter): Promise<IpcResponse<TradeListItem[]>> =>
      transport.call('trades:list', filter),
    listAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<TradeListItem[]>> =>
      transport.call('trades:listAwaitingReflection', { accountId: accountId ?? null }),
    countAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<number>> =>
      transport.call('trades:countAwaitingReflection', { accountId: accountId ?? null }),
    get: (tradeId: string): Promise<IpcResponse<TradeDetail>> =>
      transport.call('trades:get', { tradeId }),
    delete: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('trades:delete', { tradeId }),
    addScreenshot: (
      tradeId: string,
      kind: string,
      sourcePath: string,
      caption?: string,
    ): Promise<IpcResponse<TradeScreenshot>> =>
      transport.call('trades:addScreenshot', { tradeId, kind, sourcePath, caption }),
    pickScreenshots: (tradeId: string): Promise<IpcResponse<string[]>> =>
      transport.call('trades:pickScreenshots', { tradeId }),
    listScreenshots: (tradeId: string): Promise<IpcResponse<TradeScreenshot[]>> =>
      transport.call('trades:listScreenshots', { tradeId }),
    deleteScreenshot: (screenshotId: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('trades:deleteScreenshot', { screenshotId }),
  },

  dashboard: {
    getStats: (accountId: string): Promise<IpcResponse<DashboardStats>> =>
      transport.call('dashboard:getStats', { accountId }),
  },

  analytics: {
    performance: (filter: AnalyticsFilter): Promise<IpcResponse<PerformanceStats>> =>
      transport.call('analytics:performance', { filter }),
    adherence: (filter: AnalyticsFilter): Promise<IpcResponse<RuleAdherenceStats>> =>
      transport.call('analytics:adherence', { filter }),
    setups: (filter: AnalyticsFilter): Promise<IpcResponse<SetupPerformanceStats>> =>
      transport.call('analytics:setups', { filter }),
    behavioral: (filter: AnalyticsFilter): Promise<IpcResponse<BehavioralStats>> =>
      transport.call('analytics:behavioral', { filter }),
    phases: (): Promise<IpcResponse<AccountsPhaseStats>> =>
      transport.call('analytics:phases', undefined),
    derived: (filter: AnalyticsFilter): Promise<IpcResponse<DerivedStats>> =>
      transport.call('analytics:derived', { filter }),
    listReviews: (accountId?: string | null): Promise<IpcResponse<ReviewSummary[]>> =>
      transport.call('analytics:listReviews', { accountId: accountId ?? null }),
    createReview: (input: CreateReviewInput): Promise<IpcResponse<ReviewSummary>> =>
      transport.call('analytics:createReview', input),
    playbookStats: (filter: AnalyticsFilter): Promise<IpcResponse<PlaybookStats>> =>
      transport.call('analytics:playbooks', { filter }),
  },

  playbooks: {
    list: (accountId: string): Promise<IpcResponse<Playbook[]>> =>
      transport.call('playbooks:list', { accountId }),
    get: (id: string): Promise<IpcResponse<Playbook>> => transport.call('playbooks:get', { id }),
    create: (input: CreatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      transport.call('playbooks:create', input),
    update: (input: UpdatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      transport.call('playbooks:update', input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('playbooks:delete', { id }),
  },

  insights: {
    list: (accountId: string): Promise<IpcResponse<Insight[]>> =>
      transport.call('insights:list', { accountId }),
    dismiss: (accountId: string, insightId: string): Promise<IpcResponse<void>> =>
      transport.call('insights:dismiss', { accountId, insightId }),
  },

  notebook: {
    list: (): Promise<IpcResponse<NotebookEntrySummary[]>> =>
      transport.call('notebook:list', undefined),
    search: (input: NotebookSearchInput): Promise<IpcResponse<NotebookEntrySummary[]>> =>
      transport.call('notebook:search', input),
    get: (id: string): Promise<IpcResponse<NotebookEntry>> =>
      transport.call('notebook:get', { id }),
    create: (input: CreateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      transport.call('notebook:create', input),
    update: (input: UpdateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      transport.call('notebook:update', input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> =>
      transport.call('notebook:delete', { id }),
  },

  import: {
    previewMt5: (input: Mt5PreviewInput): Promise<IpcResponse<ImportPreview>> =>
      transport.call('import:previewMt5', input),
    commitMt5: (input: Mt5CommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      transport.call('import:commitMt5', input),
    previewCtrader: (input: CTraderPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      transport.call('import:previewCtrader', input),
    commitCtrader: (input: CTraderCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      transport.call('import:commitCtrader', input),
    previewTradingView: (input: TvPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      transport.call('import:previewTradingView', input),
    commitTradingView: (input: TvCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      transport.call('import:commitTradingView', input),
  },

  auth: {
    signup: (input: SignupInput): Promise<IpcResponse<SignupResult>> =>
      transport.call('auth:signup', input),
    login: (input: LoginInput): Promise<IpcResponse<PublicSession>> =>
      transport.call('auth:login', input),
    logout: (): Promise<IpcResponse<void>> => transport.call('auth:logout', undefined),
    getSession: (): Promise<IpcResponse<PublicSession | null>> =>
      transport.call('auth:getSession', undefined),
    restore: (): Promise<IpcResponse<PublicSession | null>> =>
      transport.call('auth:restore', undefined),
    verifyEmail: (token: string): Promise<IpcResponse<{ verified: boolean }>> =>
      transport.call('auth:verifyEmail', { token }),
    forgotPassword: (input: ForgotPasswordInput): Promise<IpcResponse<{ sent: true }>> =>
      transport.call('auth:forgotPassword', input),
    resetPassword: (input: ResetPasswordInput): Promise<IpcResponse<{ reset: true }>> =>
      transport.call('auth:resetPassword', input),
  },

  vault: {
    status: (): Promise<IpcResponse<VaultStatus>> => transport.call('vault:status', undefined),
    unlock: (password: string): Promise<IpcResponse<UnlockVaultResult>> =>
      transport.call('vault:unlock', { password }),
    recover: (
      phrase: readonly string[],
      newPassword: string,
    ): Promise<IpcResponse<UnlockVaultResult>> =>
      transport.call('vault:recover', { phrase, newPassword }),
    lock: (): Promise<IpcResponse<void>> => transport.call('vault:lock', undefined),
  },

  billing: {
    status: (): Promise<IpcResponse<BillingStatusOutput>> =>
      transport.call('billing:status', undefined),
    checkout: (input: CheckoutInputBody): Promise<IpcResponse<CheckoutOutput>> =>
      transport.call('billing:checkout', input),
    portal: (): Promise<IpcResponse<CheckoutOutput>> => transport.call('billing:portal', undefined),
    cancel: (input: CancelInputBody): Promise<IpcResponse<CancelOutput>> =>
      transport.call('billing:cancel', input),
  },

  sync: {
    now: (): Promise<IpcResponse<SyncNowResult>> => transport.call('sync:now', undefined),
    status: (): Promise<IpcResponse<SyncStatusResult>> => transport.call('sync:status', undefined),
    listConflicts: (): Promise<IpcResponse<ConflictDTO[]>> =>
      transport.call('sync:conflicts:list', undefined),
    countConflicts: (): Promise<IpcResponse<number>> =>
      transport.call('sync:conflicts:count', undefined),
    resolveConflict: (input: {
      conflictId: number
      winner: 'local' | 'remote'
    }): Promise<IpcResponse<{ ok: true }>> => transport.call('sync:conflicts:resolve', input),
  },

  broker: {
    status: (): Promise<IpcResponse<BrokerStatus>> => transport.call('broker:status', undefined),
    getMt5Config: (): Promise<IpcResponse<Mt5BridgeConfig>> =>
      transport.call('broker:getMt5Config', undefined),
    installMt5Ea: (): Promise<IpcResponse<Mt5EaInstallResult>> =>
      transport.call('broker:installMt5Ea', undefined),
    revealMt5Experts: (path: string): Promise<IpcResponse<void>> =>
      transport.call('broker:revealMt5Experts', { path }),
    getCtraderConfig: (): Promise<IpcResponse<CtraderRuntimeConfig>> =>
      transport.call('broker:getCtraderConfig', undefined),
    ctraderConnect: (): Promise<IpcResponse<void>> =>
      transport.call('broker:ctraderConnect', undefined),
    ctraderDisconnect: (): Promise<IpcResponse<void>> =>
      transport.call('broker:ctraderDisconnect', undefined),
    ctraderSetEnvironment: (env: CtraderEnvironment): Promise<IpcResponse<void>> =>
      transport.call('broker:ctraderSetEnvironment', env),
    setCtraderCredentials: (input: {
      clientId: string
      clientSecret: string
    }): Promise<IpcResponse<void>> => transport.call('broker:setCtraderCredentials', input),
    clearCtraderCredentials: (): Promise<IpcResponse<void>> =>
      transport.call('broker:clearCtraderCredentials', undefined),
    listAccountMap: (): Promise<IpcResponse<BrokerAccountMapEntry[]>> =>
      transport.call('broker:listAccountMap', undefined),
    listUnmappedAccounts: (): Promise<IpcResponse<UnmappedBrokerAccount[]>> =>
      transport.call('broker:listUnmappedAccounts', undefined),
    setAccountMap: (input: {
      broker: BrokerKind
      brokerAccountId: string
      cairnAccountId: string
    }): Promise<IpcResponse<BrokerAccountMapEntry>> =>
      transport.call('broker:setAccountMap', input),
    deleteAccountMap: (input: {
      broker: BrokerKind
      brokerAccountId: string
    }): Promise<IpcResponse<void>> => transport.call('broker:deleteAccountMap', input),
    diagnostics: (): Promise<IpcResponse<BrokerDiagnostics>> =>
      transport.call('broker:diagnostics', undefined),
  },

  backup: {
    getSettings: (): Promise<IpcResponse<BackupSettings>> =>
      transport.call('backup:getSettings', undefined),
    setSettings: (s: Partial<BackupSettings>): Promise<IpcResponse<void>> =>
      transport.call('backup:setSettings', s),
    pickFolder: (): Promise<IpcResponse<string | null>> =>
      transport.call('backup:pickFolder', undefined),
    now: (): Promise<IpcResponse<BackupResult>> => transport.call('backup:now', undefined),
    nowToFolder: (): Promise<IpcResponse<BackupResult>> =>
      transport.call('backup:nowToFolder', undefined),
    getLog: (): Promise<IpcResponse<BackupLogEntry[]>> =>
      transport.call('backup:getLog', undefined),
    pickRestoreFile: (): Promise<IpcResponse<RestoreInfo & { path: string }>> =>
      transport.call('backup:pickRestoreFile', undefined),
    restore: (path: string, ack: string): Promise<IpcResponse<void>> =>
      transport.call('backup:restore', { path, ack }),
    reschedule: (): Promise<IpcResponse<void>> => transport.call('backup:reschedule', undefined),
  },
} as const
