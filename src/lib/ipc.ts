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
  DashboardStats,
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
      }
      data: {
        openFolder: () => Promise<IpcResponse<void>>
        export: () => Promise<IpcResponse<string>>
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
        list: (filter: TradeFilter) => Promise<IpcResponse<TradeListItem[]>>
        get: (tradeId: string) => Promise<IpcResponse<TradeDetail>>
        delete: (tradeId: string) => Promise<IpcResponse<{ ok: true }>>
        addScreenshot: (tradeId: string, kind: string, sourcePath: string, caption?: string) => Promise<IpcResponse<TradeScreenshot>>
        pickScreenshots: (tradeId: string) => Promise<IpcResponse<string[]>>
        listScreenshots: (tradeId: string) => Promise<IpcResponse<TradeScreenshot[]>>
        deleteScreenshot: (screenshotId: string) => Promise<IpcResponse<{ ok: true }>>
      }
      dashboard: {
        getStats: (accountId: string) => Promise<IpcResponse<DashboardStats>>
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
        return { ok: false, error: { code: 'PARSE_ERROR', message: `Failed to parse setting: ${key}` } }
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
  },

  pairs: {
    list: (): Promise<IpcResponse<Pair[]>> => window.api.pairs.list(),
    create: (input: CreatePairInput): Promise<IpcResponse<Pair>> =>
      window.api.pairs.create(input),
    update: (input: UpdatePairInput): Promise<IpcResponse<Pair>> =>
      window.api.pairs.update(input),
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
    reset: (ack: string): Promise<IpcResponse<void>> => window.api.data.reset(ack),
  },

  paths: {
    pickFolder: (): Promise<IpcResponse<string | null>> => window.api.paths.pickFolder(),
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
    lock: (sessionId: string): Promise<IpcResponse<Session>> =>
      window.api.sessions.lock(sessionId),
  },

  trades: {
    create: (input: CreateTradeInput): Promise<IpcResponse<Trade>> =>
      window.api.trades.create(input),
    setOpen: (tradeId: string, accountId: string): Promise<IpcResponse<Trade>> =>
      window.api.trades.setOpen(tradeId, accountId),
    close: (input: CloseTradeInput): Promise<IpcResponse<Trade>> =>
      window.api.trades.close(input),
    list: (filter: TradeFilter): Promise<IpcResponse<TradeListItem[]>> =>
      window.api.trades.list(filter),
    get: (tradeId: string): Promise<IpcResponse<TradeDetail>> =>
      window.api.trades.get(tradeId),
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
} as const
