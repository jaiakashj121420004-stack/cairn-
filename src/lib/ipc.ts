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
      }
      paths: {
        pickFolder: () => Promise<IpcResponse<string | null>>
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
} as const
