import { ipcMain } from 'electron'
import { z } from 'zod'
import { getDb } from '../db/index'
import {
  evaluatePreTrade,
  evaluateModification,
  getSessionState,
  recordOverride,
  onTradeClosed,
  clearCooldownById,
  listRules,
  detectCloseViolations,
} from '../services/rules-engine/index'
import type {
  IpcResponse,
  RuleEvaluationDTO,
  SessionStateDTO,
  DraftTradeInput,
  EvaluateModificationInput,
  OverrideInputDTO,
  CloseDetectionDTO,
} from '../../shared/types/index'

const DraftTradeSchema = z.object({
  accountId: z.string().min(1),
  sessionId: z.string().nullable().optional(),
  pairId: z.string().min(1),
  setupId: z.string().min(1),
  killzoneId: z.string().nullable().optional(),
  direction: z.enum(['long', 'short']),
  mode: z.enum(['live', 'sim', 'backtest']).default('live'),
  entryPrice: z.number().int(),
  stopLossPrice: z.number().int(),
  takeProfitPrice: z.number().int(),
  slPips: z.number().int().nonnegative(),
  rrRatio: z.number().int().nonnegative(),
  lotSize: z.number().int().nonnegative(),
  riskAmountCents: z.number().int().nonnegative(),
  riskPctBps: z.number().int().nonnegative(),
  plannedInvalidation: z.string(),
  mssConfirmed: z.number().int().min(0).max(1),
  htfBiasAligned: z.number().int().min(0).max(1),
  dxyAligned: z.number().int().min(0).max(1).nullable().optional(),
  preCalmScore: z.number().int().min(1).max(10),
  preUrgencyScore: z.number().int().min(1).max(10),
  preNeedScore: z.number().int().min(1).max(10),
  plannedLotSize: z.number().int().nonnegative().optional(),
  timestamp: z.number().int().optional(),
})

const EvaluateModificationSchema = z.object({
  accountId: z.string().min(1),
  tradeId: z.string().min(1),
  field: z.enum(['stop_loss_price', 'take_profit_price', 'lot_size']),
  currentValue: z.number().int(),
  newValue: z.number().int(),
})

const OverrideSchema = z.object({
  accountId: z.string().min(1),
  tradeId: z.string().min(1).optional(),
  ruleKey: z.string().min(1),
  reason: z.string(),
  ack: z.string(),
})

const GetSessionStateSchema = z.object({ accountId: z.string().min(1) })
const ClearCooldownSchema = z.object({ id: z.string().min(1), ack: z.string().default('') })
const OnTradeClosedSchema = z.object({ tradeId: z.string().min(1) })
const DetectCloseViolationsSchema = z.object({ tradeId: z.string().min(1) })

export function registerRulesHandlers(): void {
  ipcMain.handle(
    'rules:evaluatePreTrade',
    (_e, raw: DraftTradeInput): IpcResponse<RuleEvaluationDTO[]> => {
      const parsed = DraftTradeSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const draft = {
          ...parsed.data,
          sessionId: parsed.data.sessionId ?? null,
          killzoneId: parsed.data.killzoneId ?? null,
          dxyAligned: parsed.data.dxyAligned ?? null,
        }
        const results = evaluatePreTrade(db, parsed.data.accountId, draft)
        return { ok: true, data: results }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'rules:evaluateModification',
    (_e, raw: EvaluateModificationInput): IpcResponse<RuleEvaluationDTO[]> => {
      const parsed = EvaluateModificationSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const results = evaluateModification(db, parsed.data.accountId, parsed.data.tradeId, {
          field: parsed.data.field,
          currentValue: parsed.data.currentValue,
          newValue: parsed.data.newValue,
        })
        return { ok: true, data: results }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'rules:getSessionState',
    (_e, raw: { accountId: string }): IpcResponse<SessionStateDTO> => {
      const parsed = GetSessionStateSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        return { ok: true, data: getSessionState(db, parsed.data.accountId) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle('rules:override', (_e, raw: OverrideInputDTO): IpcResponse<{ ok: true }> => {
    const parsed = OverrideSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      recordOverride(db, parsed.data)
      return { ok: true, data: { ok: true } }
    } catch (err) {
      return { ok: false, error: { code: 'OVERRIDE_REJECTED', message: (err as Error).message } }
    }
  })

  ipcMain.handle(
    'rules:clearCooldown',
    (_e, raw: { id: string; ack?: string }): IpcResponse<{ ok: true }> => {
      const parsed = ClearCooldownSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const res = clearCooldownById(db, parsed.data.id, parsed.data.ack, Date.now())
        if (!res.ok) {
          return { ok: false, error: { code: 'COOLDOWN_NOT_CLEARABLE', message: res.reason } }
        }
        return { ok: true, data: { ok: true } }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'rules:onTradeClosed',
    (_e, raw: { tradeId: string }): IpcResponse<{ ok: true }> => {
      const parsed = OnTradeClosedSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        onTradeClosed(db, parsed.data.tradeId)
        return { ok: true, data: { ok: true } }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'rules:detectCloseViolations',
    (_e, raw: { tradeId: string }): IpcResponse<CloseDetectionDTO[]> => {
      const parsed = DetectCloseViolationsSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        return { ok: true, data: detectCloseViolations(db, parsed.data.tradeId) }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'rules:listAvailable',
    (): IpcResponse<
      Array<{
        key: string
        label: string
        description: string
        category: string
        severity: string
        isHardLock: boolean
      }>
    > => {
      try {
        const rules = listRules().map((r) => ({
          key: r.key,
          label: r.label,
          description: r.description,
          category: r.category,
          severity: r.severity,
          isHardLock: r.isHardLock === true,
        }))
        return { ok: true, data: rules }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
