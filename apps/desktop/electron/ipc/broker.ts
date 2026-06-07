/**
 * Live-broker IPC (Wave 4). Read-only status surface for the renderer's
 * connection indicator. No event ingestion is driven over IPC — events arrive
 * from a main-process transport (none in this slice).
 */

import { ipcMain } from 'electron'
import {
  connectCtrader,
  disconnectCtrader,
  getBrokerIngestService,
  getCtraderRuntimeConfig,
  setCtraderEnvironmentSetting,
} from '../services/broker/index'
import { getMt5BridgeConfig } from '../services/broker/mt5/config'
import type { IpcResponse } from '../../shared/types/index'
import type {
  BrokerStatus,
  CtraderEnvironment,
  CtraderRuntimeConfig,
  Mt5BridgeConfig,
} from '@cairn/shared-types'

export function registerBrokerHandlers(): void {
  // ── broker:status ──────────────────────────────────────────────────────────
  ipcMain.handle('broker:status', (): IpcResponse<BrokerStatus> => {
    return { ok: true, data: getBrokerIngestService().status() }
  })

  // ── broker:getMt5Config ──────────────────────────────────────────────────────
  // The pairing token + loopback port + Experts-folder hint the Settings →
  // Integrations → MT5 panel renders. Reads (and lazily generates) the token.
  ipcMain.handle('broker:getMt5Config', (): IpcResponse<Mt5BridgeConfig> => {
    try {
      return { ok: true, data: getMt5BridgeConfig() }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── broker:getCtraderConfig ──────────────────────────────────────────────────
  // The cTrader panel state (app-configured / environment / linked account /
  // connection). Carries no secret.
  ipcMain.handle(
    'broker:getCtraderConfig',
    async (): Promise<IpcResponse<CtraderRuntimeConfig>> => {
      try {
        return { ok: true, data: await getCtraderRuntimeConfig() }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  // ── broker:ctraderConnect ─────────────────────────────────────────────────────
  // Runs the OAuth link (browser consent → loopback capture → token exchange) and
  // starts the read-only execution stream.
  ipcMain.handle('broker:ctraderConnect', () => connectCtrader())

  // ── broker:ctraderDisconnect ──────────────────────────────────────────────────
  ipcMain.handle('broker:ctraderDisconnect', () => disconnectCtrader())

  // ── broker:ctraderSetEnvironment ──────────────────────────────────────────────
  ipcMain.handle(
    'broker:ctraderSetEnvironment',
    (_e, env: CtraderEnvironment): IpcResponse<void> => {
      try {
        setCtraderEnvironmentSetting(env === 'live' ? 'live' : 'demo')
        return { ok: true, data: undefined }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
