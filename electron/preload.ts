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
  },

  paths: {
    pickFolder: (): Promise<IpcResponse<string | null>> => ipcRenderer.invoke('paths:pickFolder'),
  },
} as const

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
