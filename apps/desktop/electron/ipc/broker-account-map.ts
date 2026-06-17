/**
 * Broker account-mapping IPC (Wave 4 — docs/broker-integration.md §6).
 *
 * The Settings → Integrations account-map panel reads the unmapped broker accounts
 * Cairn has observed and the existing bindings, and writes/removes bindings. Every
 * boundary input is Zod-validated and every reply is the universal `Result<T>`.
 *
 * Kept separate from `broker.ts` so it depends only on the account-map service
 * surface (no MT5/cTrader transport modules) — both the handler and its test stay
 * light.
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  deleteBrokerAccountBinding,
  listBrokerAccountBindings,
  listUnmappedBrokerAccounts,
  setBrokerAccountBinding,
} from '../services/broker/index'
import type { IpcResponse } from '../../shared/types/index'
import type { BrokerAccountMapEntry, UnmappedBrokerAccount } from '@cairn/shared-types'

const BrokerKindSchema = z.enum(['mt5', 'ctrader'])

/** A broker account key: which platform + the broker-side account id. */
const AccountKeySchema = z.object({
  broker: BrokerKindSchema,
  brokerAccountId: z.string().min(1).max(128),
})

/** A binding write: a broker account key + the Cairn account to attribute fills to. */
const SetAccountMapSchema = AccountKeySchema.extend({
  cairnAccountId: z.string().uuid(),
})

export function registerBrokerAccountMapHandlers(): void {
  // ── broker:listAccountMap ────────────────────────────────────────────────────
  ipcMain.handle('broker:listAccountMap', (): IpcResponse<BrokerAccountMapEntry[]> => {
    try {
      return { ok: true, data: listBrokerAccountBindings() }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── broker:listUnmappedAccounts ──────────────────────────────────────────────
  ipcMain.handle('broker:listUnmappedAccounts', (): IpcResponse<UnmappedBrokerAccount[]> => {
    try {
      return { ok: true, data: listUnmappedBrokerAccounts() }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  // ── broker:setAccountMap ─────────────────────────────────────────────────────
  // Bind a broker account to a Cairn account; replays any buffered fills on success.
  ipcMain.handle(
    'broker:setAccountMap',
    (_e, raw: unknown): IpcResponse<BrokerAccountMapEntry> => {
      const parsed = SetAccountMapSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const { broker, brokerAccountId, cairnAccountId } = parsed.data
        return { ok: true, data: setBrokerAccountBinding(broker, brokerAccountId, cairnAccountId) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  // ── broker:deleteAccountMap ──────────────────────────────────────────────────
  ipcMain.handle('broker:deleteAccountMap', (_e, raw: unknown): IpcResponse<void> => {
    const parsed = AccountKeySchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      deleteBrokerAccountBinding(parsed.data.broker, parsed.data.brokerAccountId)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
