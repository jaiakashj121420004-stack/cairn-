import { ipcMain } from 'electron'
import { eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  Account,
  CreateAccountInput,
  UpdateAccountInput,
} from '../../shared/types/index'

const DrawdownTypeSchema = z.enum([
  'percent_of_balance',
  'percent_of_equity',
  'fixed_amount',
])
const DrawdownBasisSchema = z.enum([
  'initial_balance',
  'high_water_mark',
  'previous_day_close',
])

const CreateAccountSchema = z.object({
  displayName: z.string().min(1).max(100),
  templateId: z.string().uuid().optional(),
  propFirmId: z.string().uuid(),
  stepCount: z.number().int().min(1).max(5),
  currentPhase: z.number().int().min(1).max(5),
  accountSizeCents: z.number().int().positive(),
  leverage: z.number().int().min(1).max(2000),
  dailyDrawdownType: DrawdownTypeSchema,
  dailyDrawdownValue: z.number().int().positive(),
  totalDrawdownType: DrawdownTypeSchema,
  totalDrawdownValue: z.number().int().positive(),
  drawdownBasis: DrawdownBasisSchema,
  profitTargetPct: z.number().int().positive(),
  minTradingDays: z.number().int().min(0).optional(),
  maxTradingDays: z.number().int().min(0).optional(),
  weekendHoldingAllowed: z.boolean(),
  newsTradingAllowed: z.boolean(),
  consistencyRulePct: z.number().int().min(0).optional(),
  challengeCostCents: z.number().int().min(0),
  startDate: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
})

const UpdateAccountSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'passed', 'failed', 'paused', 'retired']).optional(),
  currentPhase: z.number().int().min(1).max(5).optional(),
  leverage: z.number().int().min(1).max(3000).optional(),
  currentEquityCents: z.number().int().optional(),
  peakEquityCents: z.number().int().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

const DEFAULT_ACCOUNT_RULES: Array<{
  ruleKey: string
  enabled: number
  value: string
  priority: number
}> = [
  { ruleKey: 'max_risk_per_trade_pct', enabled: 1, value: JSON.stringify({ maxPct: 100 }), priority: 10 },
  { ruleKey: 'max_daily_loss_pct', enabled: 1, value: JSON.stringify({ maxPct: 500 }), priority: 20 },
  {
    ruleKey: 'max_overall_daily_loss_hard_stop_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 800 }),
    priority: 30,
  },
  { ruleKey: 'min_rr_ratio', enabled: 1, value: JSON.stringify({ minRR: 200 }), priority: 40 },
  {
    ruleKey: 'position_size_matches_plan',
    enabled: 1,
    value: JSON.stringify({ tolerancePct: 5 }),
    priority: 50,
  },
  { ruleKey: 'require_mss_confirmation', enabled: 1, value: JSON.stringify({}), priority: 60 },
  {
    ruleKey: 'require_invalidation_text',
    enabled: 1,
    value: JSON.stringify({ minChars: 20 }),
    priority: 70,
  },
  { ruleKey: 'require_htf_bias_logged', enabled: 1, value: JSON.stringify({}), priority: 80 },
  { ruleKey: 'no_sl_widening', enabled: 1, value: JSON.stringify({}), priority: 90 },
  {
    ruleKey: 'require_killzone',
    enabled: 1,
    value: JSON.stringify({ zoneNames: ['London', 'NY AM'] }),
    priority: 95,
  },
  {
    ruleKey: 'require_dxy_check',
    enabled: 0,
    value: JSON.stringify({}),
    priority: 96,
  },
  { ruleKey: 'max_trades_per_day', enabled: 1, value: JSON.stringify({ maxTrades: 3 }), priority: 100 },
  {
    ruleKey: 'cooldown_after_loss_minutes',
    enabled: 1,
    value: JSON.stringify({ minutes: 30 }),
    priority: 110,
  },
  {
    ruleKey: 'daily_stop_after_losses',
    enabled: 1,
    value: JSON.stringify({ consecutiveLosses: 2 }),
    priority: 120,
  },
  {
    ruleKey: 'no_revenge_trade_window',
    enabled: 0,
    value: JSON.stringify({ minutes: 30 }),
    priority: 130,
  },
  {
    ruleKey: 'emotional_state_gate',
    enabled: 0,
    value: JSON.stringify({ maxUrgency: 7, maxNeed: 6 }),
    priority: 140,
  },
  {
    ruleKey: 'weekend_holding_blocked',
    enabled: 1,
    value: JSON.stringify({ fridayCloseUtcHour: 20 }),
    priority: 150,
  },
  {
    ruleKey: 'min_trading_days_check',
    enabled: 0,
    value: JSON.stringify({}),
    priority: 160,
  },
]

export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:list', (): IpcResponse<Account[]> => {
    try {
      const db = getDb()
      const rows = db
        .select()
        .from(schema.accounts)
        .where(isNull(schema.accounts.deletedAt))
        .all()
      return { ok: true, data: rows as Account[] }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('accounts:create', (_e, raw: CreateAccountInput): IpcResponse<Account> => {
    const parsed = CreateAccountSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const now = Date.now()
      const accountId = uuidv7()
      const d = parsed.data

      db.transaction(() => {
        db.insert(schema.accounts)
          .values({
            id: accountId,
            displayName: d.displayName,
            templateId: d.templateId ?? null,
            propFirmId: d.propFirmId,
            stepCount: d.stepCount,
            currentPhase: d.currentPhase,
            accountSizeCents: d.accountSizeCents,
            leverage: d.leverage,
            dailyDrawdownType: d.dailyDrawdownType,
            dailyDrawdownValue: d.dailyDrawdownValue,
            totalDrawdownType: d.totalDrawdownType,
            totalDrawdownValue: d.totalDrawdownValue,
            drawdownBasis: d.drawdownBasis,
            profitTargetPct: d.profitTargetPct,
            minTradingDays: d.minTradingDays ?? null,
            maxTradingDays: d.maxTradingDays ?? null,
            weekendHoldingAllowed: d.weekendHoldingAllowed ? 1 : 0,
            newsTradingAllowed: d.newsTradingAllowed ? 1 : 0,
            consistencyRulePct: d.consistencyRulePct ?? null,
            challengeCostCents: d.challengeCostCents,
            startDate: d.startDate,
            status: 'active',
            peakEquityCents: d.accountSizeCents,
            currentEquityCents: d.accountSizeCents,
            notes: d.notes ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .run()

        for (const rule of DEFAULT_ACCOUNT_RULES) {
          db.insert(schema.accountRules)
            .values({
              id: uuidv7(),
              accountId,
              ruleKey: rule.ruleKey,
              enabled: rule.enabled,
              value: rule.value,
              priority: rule.priority,
              createdAt: now,
              updatedAt: now,
            })
            .run()
        }
      })

      const row = db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, accountId))
        .get()
      return { ok: true, data: row as Account }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('accounts:update', (_e, raw: UpdateAccountInput): IpcResponse<Account> => {
    const parsed = UpdateAccountSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { id, ...fields } = parsed.data
      const updateData: Partial<typeof schema.accounts.$inferInsert> = { updatedAt: Date.now() }
      if (fields.displayName !== undefined) updateData.displayName = fields.displayName
      if (fields.status !== undefined) updateData.status = fields.status
      if (fields.currentPhase !== undefined) updateData.currentPhase = fields.currentPhase
      if (fields.leverage !== undefined) updateData.leverage = fields.leverage
      if (fields.currentEquityCents !== undefined)
        updateData.currentEquityCents = fields.currentEquityCents
      if (fields.peakEquityCents !== undefined) updateData.peakEquityCents = fields.peakEquityCents
      if ('notes' in fields) updateData.notes = fields.notes ?? null
      db.update(schema.accounts).set(updateData).where(eq(schema.accounts.id, id)).run()
      const row = db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
      return { ok: true, data: row as Account }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
