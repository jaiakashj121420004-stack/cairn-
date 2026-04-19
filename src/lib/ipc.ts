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
} as const
