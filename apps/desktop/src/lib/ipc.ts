import type { IpcResponse } from '@shared/types/index'
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

export interface DbStatus {
  integrityOk: boolean
  migrationCount: number
  tradeCount: number
}

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
      events: {
        on: (name: string, cb: (payload: unknown) => void) => () => void
        off: (name: string, cb: (payload: unknown) => void) => void
      }
    }
  }
}

export const ipc = {
  ping: (): Promise<IpcResponse<string>> => window.api.ping(),
  dbStatus: (): Promise<IpcResponse<DbStatus>> => window.api.dbStatus(),

  settings: {
    get: async <T>(key: string): Promise<IpcResponse<T | null>> => {
      const res = await window.api.settings.get(key)
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
      window.api.settings.set(key, JSON.stringify(value)),
  },

  propFirms: {
    list: (): Promise<IpcResponse<PropFirm[]>> => window.api.propFirms.list(),
    create: (input: CreatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      window.api.propFirms.create(input),
    update: (input: UpdatePropFirmInput): Promise<IpcResponse<PropFirm>> =>
      window.api.propFirms.update(input),
  },

  accountTemplates: {
    list: (): Promise<IpcResponse<AccountTemplate[]>> => window.api.accountTemplates.list(),
    create: (input: CreateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      window.api.accountTemplates.create(input),
    update: (input: UpdateAccountTemplateInput): Promise<IpcResponse<AccountTemplate>> =>
      window.api.accountTemplates.update(input),
  },

  accounts: {
    list: (): Promise<IpcResponse<Account[]>> => window.api.accounts.list(),
    create: (input: CreateAccountInput): Promise<IpcResponse<Account>> =>
      window.api.accounts.create(input),
    update: (input: UpdateAccountInput): Promise<IpcResponse<Account>> =>
      window.api.accounts.update(input),
    stats: (): Promise<IpcResponse<AccountStats[]>> => window.api.accounts.stats(),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> => window.api.accounts.delete(id),
  },

  pairs: {
    list: (): Promise<IpcResponse<Pair[]>> => window.api.pairs.list(),
    create: (input: CreatePairInput): Promise<IpcResponse<Pair>> => window.api.pairs.create(input),
    update: (input: UpdatePairInput): Promise<IpcResponse<Pair>> => window.api.pairs.update(input),
  },

  setups: {
    list: (): Promise<IpcResponse<Setup[]>> => window.api.setups.list(),
    create: (input: CreateSetupInput): Promise<IpcResponse<Setup>> =>
      window.api.setups.create(input),
    update: (input: UpdateSetupInput): Promise<IpcResponse<Setup>> =>
      window.api.setups.update(input),
  },

  killzones: {
    list: (): Promise<IpcResponse<Killzone[]>> => window.api.killzones.list(),
    create: (input: CreateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      window.api.killzones.create(input),
    update: (input: UpdateKillzoneInput): Promise<IpcResponse<Killzone>> =>
      window.api.killzones.update(input),
  },

  data: {
    openFolder: (): Promise<IpcResponse<void>> => window.api.data.openFolder(),
    export: (): Promise<IpcResponse<string>> => window.api.data.export(),
    exportPdf: (defaultName?: string): Promise<IpcResponse<string>> =>
      window.api.data.exportPdf(defaultName),
    reset: (ack: string): Promise<IpcResponse<void>> => window.api.data.reset(ack),
  },

  paths: {
    pickFolder: (): Promise<IpcResponse<string | null>> => window.api.paths.pickFolder(),
    pickImages: (): Promise<IpcResponse<string[]>> => window.api.paths.pickImages(),
    openFile: (filePath: string): Promise<IpcResponse<void>> => window.api.paths.openFile(filePath),
  },

  rules: {
    evaluatePreTrade: (input: DraftTradeInput): Promise<IpcResponse<RuleEvaluationDTO[]>> =>
      window.api.rules.evaluatePreTrade(input),
    evaluateModification: (
      input: EvaluateModificationInput,
    ): Promise<IpcResponse<RuleEvaluationDTO[]>> => window.api.rules.evaluateModification(input),
    getSessionState: (accountId: string): Promise<IpcResponse<SessionStateDTO>> =>
      window.api.rules.getSessionState(accountId),
    override: (input: OverrideInputDTO): Promise<IpcResponse<{ ok: true }>> =>
      window.api.rules.override(input),
    clearCooldown: (id: string, ack: string): Promise<IpcResponse<{ ok: true }>> =>
      window.api.rules.clearCooldown(id, ack),
    onTradeClosed: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      window.api.rules.onTradeClosed(tradeId),
    detectCloseViolations: (tradeId: string): Promise<IpcResponse<CloseDetectionDTO[]>> =>
      window.api.rules.detectCloseViolations(tradeId),
    listAvailable: () => window.api.rules.listAvailable(),
  },

  accountRules: {
    list: (accountId: string): Promise<IpcResponse<AccountRuleConfigDTO[]>> =>
      window.api.accountRules.list(accountId),
    upsert: (input: UpsertAccountRuleInput): Promise<IpcResponse<AccountRuleConfigDTO>> =>
      window.api.accountRules.upsert(input),
  },

  sessions: {
    getToday: (accountId: string): Promise<IpcResponse<Session | null>> =>
      window.api.sessions.getToday(accountId),
    upsert: (input: CreateSessionInput): Promise<IpcResponse<Session>> =>
      window.api.sessions.upsert(input),
    lock: (sessionId: string): Promise<IpcResponse<Session>> => window.api.sessions.lock(sessionId),
  },

  trades: {
    create: (input: CreateTradeInput): Promise<IpcResponse<Trade>> =>
      window.api.trades.create(input),
    setOpen: (tradeId: string, accountId: string): Promise<IpcResponse<Trade>> =>
      window.api.trades.setOpen(tradeId, accountId),
    close: (input: CloseTradeInput): Promise<IpcResponse<Trade>> => window.api.trades.close(input),
    closeMinimal: (input: CloseMinimalInput): Promise<IpcResponse<Trade>> =>
      window.api.trades.closeMinimal(input),
    completePhase2: (input: CompletePhase2Input): Promise<IpcResponse<Trade>> =>
      window.api.trades.completePhase2(input),
    partialClose: (input: PartialCloseInput): Promise<IpcResponse<Trade>> =>
      window.api.trades.partialClose(input),
    list: (filter: TradeFilter): Promise<IpcResponse<TradeListItem[]>> =>
      window.api.trades.list(filter),
    listAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<TradeListItem[]>> =>
      window.api.trades.listAwaitingReflection(accountId ?? null),
    countAwaitingReflection: (accountId?: string | null): Promise<IpcResponse<number>> =>
      window.api.trades.countAwaitingReflection(accountId ?? null),
    get: (tradeId: string): Promise<IpcResponse<TradeDetail>> => window.api.trades.get(tradeId),
    delete: (tradeId: string): Promise<IpcResponse<{ ok: true }>> =>
      window.api.trades.delete(tradeId),
    addScreenshot: (
      tradeId: string,
      kind: string,
      sourcePath: string,
      caption?: string,
    ): Promise<IpcResponse<TradeScreenshot>> =>
      window.api.trades.addScreenshot(tradeId, kind, sourcePath, caption),
    pickScreenshots: (tradeId: string): Promise<IpcResponse<string[]>> =>
      window.api.trades.pickScreenshots(tradeId),
    listScreenshots: (tradeId: string): Promise<IpcResponse<TradeScreenshot[]>> =>
      window.api.trades.listScreenshots(tradeId),
    deleteScreenshot: (screenshotId: string): Promise<IpcResponse<{ ok: true }>> =>
      window.api.trades.deleteScreenshot(screenshotId),
  },

  dashboard: {
    getStats: (accountId: string): Promise<IpcResponse<DashboardStats>> =>
      window.api.dashboard.getStats(accountId),
  },

  analytics: {
    performance: (filter: AnalyticsFilter): Promise<IpcResponse<PerformanceStats>> =>
      window.api.analytics.performance(filter),
    adherence: (filter: AnalyticsFilter): Promise<IpcResponse<RuleAdherenceStats>> =>
      window.api.analytics.adherence(filter),
    setups: (filter: AnalyticsFilter): Promise<IpcResponse<SetupPerformanceStats>> =>
      window.api.analytics.setups(filter),
    behavioral: (filter: AnalyticsFilter): Promise<IpcResponse<BehavioralStats>> =>
      window.api.analytics.behavioral(filter),
    phases: (): Promise<IpcResponse<AccountsPhaseStats>> => window.api.analytics.phases(),
    derived: (filter: AnalyticsFilter): Promise<IpcResponse<DerivedStats>> =>
      window.api.analytics.derived(filter),
    listReviews: (accountId?: string | null): Promise<IpcResponse<ReviewSummary[]>> =>
      window.api.analytics.listReviews(accountId ?? null),
    createReview: (input: CreateReviewInput): Promise<IpcResponse<ReviewSummary>> =>
      window.api.analytics.createReview(input),
    playbookStats: (filter: AnalyticsFilter): Promise<IpcResponse<PlaybookStats>> =>
      window.api.analytics.playbookStats(filter),
  },

  playbooks: {
    list: (accountId: string): Promise<IpcResponse<Playbook[]>> =>
      window.api.playbooks.list(accountId),
    get: (id: string): Promise<IpcResponse<Playbook>> => window.api.playbooks.get(id),
    create: (input: CreatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      window.api.playbooks.create(input),
    update: (input: UpdatePlaybookInput): Promise<IpcResponse<Playbook>> =>
      window.api.playbooks.update(input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> => window.api.playbooks.delete(id),
  },

  insights: {
    list: (accountId: string): Promise<IpcResponse<Insight[]>> =>
      window.api.insights.list(accountId),
    dismiss: (accountId: string, insightId: string): Promise<IpcResponse<void>> =>
      window.api.insights.dismiss(accountId, insightId),
  },

  notebook: {
    list: (): Promise<IpcResponse<NotebookEntrySummary[]>> => window.api.notebook.list(),
    search: (input: NotebookSearchInput): Promise<IpcResponse<NotebookEntrySummary[]>> =>
      window.api.notebook.search(input),
    get: (id: string): Promise<IpcResponse<NotebookEntry>> => window.api.notebook.get(id),
    create: (input: CreateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      window.api.notebook.create(input),
    update: (input: UpdateNotebookEntryInput): Promise<IpcResponse<NotebookEntry>> =>
      window.api.notebook.update(input),
    delete: (id: string): Promise<IpcResponse<{ ok: true }>> => window.api.notebook.delete(id),
  },

  import: {
    previewMt5: (input: Mt5PreviewInput): Promise<IpcResponse<ImportPreview>> =>
      window.api.import.previewMt5(input),
    commitMt5: (input: Mt5CommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      window.api.import.commitMt5(input),
    previewCtrader: (input: CTraderPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      window.api.import.previewCtrader(input),
    commitCtrader: (input: CTraderCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      window.api.import.commitCtrader(input),
    previewTradingView: (input: TvPreviewInput): Promise<IpcResponse<ImportPreview>> =>
      window.api.import.previewTradingView(input),
    commitTradingView: (input: TvCommitInput): Promise<IpcResponse<ImportCommitResult>> =>
      window.api.import.commitTradingView(input),
  },

  backup: {
    getSettings: (): Promise<IpcResponse<BackupSettings>> => window.api.backup.getSettings(),
    setSettings: (s: Partial<BackupSettings>): Promise<IpcResponse<void>> =>
      window.api.backup.setSettings(s),
    pickFolder: (): Promise<IpcResponse<string | null>> => window.api.backup.pickFolder(),
    now: (): Promise<IpcResponse<BackupResult>> => window.api.backup.now(),
    nowToFolder: (): Promise<IpcResponse<BackupResult>> => window.api.backup.nowToFolder(),
    getLog: (): Promise<IpcResponse<BackupLogEntry[]>> => window.api.backup.getLog(),
    pickRestoreFile: (): Promise<IpcResponse<RestoreInfo & { path: string }>> =>
      window.api.backup.pickRestoreFile(),
    restore: (path: string, ack: string): Promise<IpcResponse<void>> =>
      window.api.backup.restore(path, ack),
    reschedule: (): Promise<IpcResponse<void>> => window.api.backup.reschedule(),
  },
} as const
