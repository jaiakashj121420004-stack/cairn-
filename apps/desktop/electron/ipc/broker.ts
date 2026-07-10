/**
 * Live-broker IPC (Wave 4). Read-only status surface for the renderer's
 * connection indicator. No event ingestion is driven over IPC — events arrive
 * from a main-process transport (none in this slice).
 */

import { ipcMain } from 'electron'
import {
  connectCtrader,
  disconnectCtrader,
  forgetCtraderAppCredentials,
  getBrokerDiagnostics,
  getBrokerIngestService,
  getCtraderRuntimeConfig,
  saveCtraderAppCredentials,
  setCtraderEnvironmentSetting,
} from '../services/broker/index'
import { getMt5BridgeConfig } from '../services/broker/mt5/config'
import { installMt5Ea, revealMt5ExpertsFolder } from '../services/broker/mt5/installer'
import type { IpcResponse } from '../../shared/types/index'
import type {
  BrokerDiagnostics,
  BrokerStatus,
  CtraderEnvironment,
  CtraderRuntimeConfig,
  Mt5BridgeConfig,
  Mt5EaInstallResult,
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

  // ── broker:installMt5Ea ──────────────────────────────────────────────────────
  // One-click copy of the bundled Cairn EA into every detected MQL5/Experts folder,
  // so the trader never hand-copies the .mq5 out of the app resources. Read-only;
  // destinations come from findMt5ExpertsPaths(), never the renderer.
  ipcMain.handle('broker:installMt5Ea', (): IpcResponse<Mt5EaInstallResult> => installMt5Ea())

  // ── broker:revealMt5Experts ──────────────────────────────────────────────────
  // Open a *detected* Experts folder in the OS file manager. The path is allow-listed
  // against findMt5ExpertsPaths() inside the service, so this is not an open-anything
  // sink; a non-string / unrecognised path is rejected with a typed error.
  ipcMain.handle('broker:revealMt5Experts', (_e, raw: unknown): Promise<IpcResponse<void>> => {
    const path = (raw as { path?: unknown } | null)?.path
    if (typeof path !== 'string') {
      return Promise.resolve({
        ok: false,
        error: { code: 'BAD_INPUT', message: 'path must be a string' },
      })
    }
    return revealMt5ExpertsFolder(path)
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

  // ── broker:setCtraderCredentials ──────────────────────────────────────────────
  // Save the user's cTrader OAuth app client id/secret to the OS keychain, so a stock
  // install can connect without env vars. The secret never touches SQLite or logs.
  ipcMain.handle('broker:setCtraderCredentials', (_e, raw: unknown): Promise<IpcResponse<void>> => {
    const r = raw as { clientId?: unknown; clientSecret?: unknown } | null
    const clientId = typeof r?.clientId === 'string' ? r.clientId : ''
    const clientSecret = typeof r?.clientSecret === 'string' ? r.clientSecret : ''
    if (!clientId.trim() || !clientSecret.trim()) {
      return Promise.resolve({
        ok: false,
        error: { code: 'BAD_INPUT', message: 'client id and secret are required' },
      })
    }
    return saveCtraderAppCredentials(clientId, clientSecret)
  })

  // ── broker:clearCtraderCredentials ────────────────────────────────────────────
  // Forget stored cTrader credentials (disconnects the stream first).
  ipcMain.handle(
    'broker:clearCtraderCredentials',
    (): Promise<IpcResponse<void>> => forgetCtraderAppCredentials(),
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

  // ── broker:diagnostics ────────────────────────────────────────────────────────
  // Connection-health snapshot for Settings → Integrations. Read-only; every
  // field is sourced from state the desktop main process actually tracks.
  ipcMain.handle('broker:diagnostics', (): IpcResponse<BrokerDiagnostics> => {
    try {
      return { ok: true, data: getBrokerDiagnostics() }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
