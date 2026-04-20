import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '../shared/types/index'
import type { DbStatus } from './ipc/db'
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
  },

  data: {
    openFolder: (): Promise<IpcResponse<void>> => ipcRenderer.invoke('data:openFolder'),
    export: (): Promise<IpcResponse<string>> => ipcRenderer.invoke('data:export'),
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
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
