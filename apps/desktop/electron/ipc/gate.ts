/**
 * Pre-trade gate IPC (P0.7 slice 4). The overlay renderer calls these to read its
 * state and to record a plan / breach. All plan-writing paths are entitlement-gated
 * inside the controller (paid feature, §2.14).
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  gateBreachRules,
  gateConfirmPlan,
  gateDismiss,
  getCurrentGateIntent,
  isPreTradeGateEntitled,
} from '../services/pre-trade-gate/gate-controller'
import type { IpcResponse } from '../../shared/types/index'
import type { GateIntentContext } from '../services/pre-trade-gate/gate-controller'

const DirectionSchema = z.enum(['long', 'short'])

const ConfirmPlanSchema = z.object({
  accountId: z.string().min(1),
  pairId: z.string().min(1),
  direction: DirectionSchema,
  intendedEntry: z.number().int(),
  intendedSl: z.number().int(),
  intendedTp: z.number().int(),
  slPips: z.number().int(),
  rrRatio: z.number().int(),
  lotSize: z.number().int(),
  riskPctBps: z.number().int(),
  confluencesJson: z.string().nullable().default(null),
  invalidation: z.string().nullable().default(null),
})

const BreachSchema = z.object({
  accountId: z.string().min(1),
  pairId: z.string().min(1),
  direction: DirectionSchema,
})

export function registerGateHandlers(): void {
  ipcMain.handle('gate:status', (): IpcResponse<{ entitled: boolean }> => {
    return { ok: true, data: { entitled: isPreTradeGateEntitled() } }
  })

  ipcMain.handle('gate:getIntent', (): IpcResponse<GateIntentContext | null> => {
    return { ok: true, data: getCurrentGateIntent() }
  })

  ipcMain.handle('gate:confirmPlan', (_e, raw: unknown): IpcResponse<{ id: string }> => {
    const parsed = ConfirmPlanSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return gateConfirmPlan(parsed.data)
  })

  ipcMain.handle('gate:breachRules', (_e, raw: unknown): IpcResponse<{ id: string }> => {
    const parsed = BreachSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    return gateBreachRules(parsed.data)
  })

  ipcMain.handle('gate:dismiss', (): IpcResponse<void> => {
    gateDismiss()
    return { ok: true, data: undefined }
  })
}
