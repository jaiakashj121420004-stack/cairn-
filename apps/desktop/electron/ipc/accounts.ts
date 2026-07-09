import { and, asc, eq, isNull } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { enqueueSyncOp } from '../services/sync'
import type {
  IpcResponse,
  Account,
  AccountPhase,
  CreateAccountInput,
  UpdateAccountInput,
} from '../../shared/types/index'
import type { CairnDb } from '../db/index'

const DrawdownTypeSchema = z.enum(['percent_of_balance', 'percent_of_equity', 'fixed_amount'])
const DrawdownBasisSchema = z.enum(['initial_balance', 'high_water_mark', 'previous_day_close'])

/** One phase of the ladder. All money/percent values are integer basis points (§2.5). */
const AccountPhaseInputSchema = z.object({
  phaseNumber: z.number().int().min(1).max(5),
  /** null = no profit target for this phase (funded phase). */
  profitTargetPct: z.number().int().positive().nullable(),
  dailyDrawdownType: DrawdownTypeSchema,
  dailyDrawdownValue: z.number().int().positive(),
  totalDrawdownType: DrawdownTypeSchema,
  totalDrawdownValue: z.number().int().positive(),
  minTradingDays: z.number().int().min(0).nullable().optional(),
  maxTradingDays: z.number().int().min(0).nullable().optional(),
  consistencyRulePct: z.number().int().min(0).nullable().optional(),
})

type AccountPhaseInput = z.infer<typeof AccountPhaseInputSchema>

/** Phase numbers must be exactly 1..n — no gaps, no duplicates. */
function refineContiguousPhases(
  phases: ReadonlyArray<{ phaseNumber: number }>,
  ctx: z.RefinementCtx,
): void {
  const nums = phases.map((p) => p.phaseNumber).sort((a, b) => a - b)
  if (!nums.every((n, i) => n === i + 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phase numbers must be contiguous, starting at 1.',
      path: ['phases'],
    })
  }
}

const CreateAccountSchema = z
  .object({
    displayName: z.string().min(1).max(100),
    templateId: z.string().uuid().optional(),
    propFirmId: z.string().uuid(),
    stepCount: z.number().int().min(1).max(5),
    currentPhase: z.number().int().min(1).max(5),
    accountSizeCents: z.number().int().positive(),
    leverage: z.number().int().min(1).max(3000),
    dailyDrawdownType: DrawdownTypeSchema,
    dailyDrawdownValue: z.number().int().positive(),
    totalDrawdownType: DrawdownTypeSchema,
    totalDrawdownValue: z.number().int().positive(),
    drawdownBasis: DrawdownBasisSchema,
    /** ACTIVE phase's target in bps. 0 = no target (funded phase). */
    profitTargetPct: z.number().int().min(0),
    minTradingDays: z.number().int().min(0).optional(),
    maxTradingDays: z.number().int().min(0).optional(),
    weekendHoldingAllowed: z.boolean(),
    newsTradingAllowed: z.boolean(),
    consistencyRulePct: z.number().int().min(0).optional(),
    challengeCostCents: z.number().int().min(0),
    startDate: z.number().int().positive(),
    notes: z.string().max(1000).optional(),
    phases: z.array(AccountPhaseInputSchema).min(1).max(5).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.currentPhase > val.stepCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'currentPhase cannot exceed stepCount.',
        path: ['currentPhase'],
      })
    }
    if (val.phases) {
      if (val.phases.length !== val.stepCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'phases must contain exactly one entry per step.',
          path: ['phases'],
        })
      }
      refineContiguousPhases(val.phases, ctx)
    }
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

const AdvancePhaseSchema = z.object({ accountId: z.string().uuid() })

const UpdateAccountPhasesSchema = z
  .object({
    accountId: z.string().uuid(),
    phases: z.array(AccountPhaseInputSchema).min(1).max(5),
  })
  .superRefine((val, ctx) => refineContiguousPhases(val.phases, ctx))

type AccountRow = typeof schema.accounts.$inferSelect
type PhaseRow = typeof schema.accountPhases.$inferSelect

/** Active (non-deleted) phase rows for one account, ordered by phase number. */
function loadPhases(db: CairnDb, accountId: string): PhaseRow[] {
  return db
    .select()
    .from(schema.accountPhases)
    .where(
      and(eq(schema.accountPhases.accountId, accountId), isNull(schema.accountPhases.deletedAt)),
    )
    .orderBy(asc(schema.accountPhases.phaseNumber))
    .all()
}

/** Attach the phase ladder to a raw account row to form the Account DTO. */
function toAccountDto(row: AccountRow, phases: PhaseRow[]): Account {
  return { ...row, phases: phases as AccountPhase[] } as Account
}

/**
 * The account columns that mirror the ACTIVE phase (denormalization contract —
 * the rules engine keeps reading the account row unchanged). A null profit
 * target (funded phase) is stored as 0 because accounts.profit_target_pct is
 * NOT NULL; 0 means "no target".
 */
function denormFromPhase(p: {
  profitTargetPct: number | null
  dailyDrawdownType: string
  dailyDrawdownValue: number
  totalDrawdownType: string
  totalDrawdownValue: number
  minTradingDays?: number | null | undefined
  maxTradingDays?: number | null | undefined
  consistencyRulePct?: number | null | undefined
}): Pick<
  typeof schema.accounts.$inferInsert,
  | 'profitTargetPct'
  | 'dailyDrawdownType'
  | 'dailyDrawdownValue'
  | 'totalDrawdownType'
  | 'totalDrawdownValue'
  | 'minTradingDays'
  | 'maxTradingDays'
  | 'consistencyRulePct'
> {
  return {
    profitTargetPct: p.profitTargetPct ?? 0,
    dailyDrawdownType: p.dailyDrawdownType,
    dailyDrawdownValue: p.dailyDrawdownValue,
    totalDrawdownType: p.totalDrawdownType,
    totalDrawdownValue: p.totalDrawdownValue,
    minTradingDays: p.minTradingDays ?? null,
    maxTradingDays: p.maxTradingDays ?? null,
    consistencyRulePct: p.consistencyRulePct ?? null,
  }
}

const DEFAULT_ACCOUNT_RULES: Array<{
  ruleKey: string
  enabled: number
  value: string
  priority: number
}> = [
  {
    ruleKey: 'max_risk_per_trade_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 100 }),
    priority: 10,
  },
  {
    ruleKey: 'max_daily_loss_pct',
    enabled: 1,
    value: JSON.stringify({ maxPct: 500 }),
    priority: 20,
  },
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
  { ruleKey: 'no_tp_narrowing', enabled: 1, value: JSON.stringify({}), priority: 91 },
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
  {
    ruleKey: 'max_trades_per_day',
    enabled: 1,
    value: JSON.stringify({ maxTrades: 3 }),
    priority: 100,
  },
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
      const rows = db.select().from(schema.accounts).where(isNull(schema.accounts.deletedAt)).all()
      const phaseRows = db
        .select()
        .from(schema.accountPhases)
        .where(isNull(schema.accountPhases.deletedAt))
        .orderBy(asc(schema.accountPhases.accountId), asc(schema.accountPhases.phaseNumber))
        .all()
      const byAccount = new Map<string, PhaseRow[]>()
      for (const p of phaseRows) {
        const list = byAccount.get(p.accountId) ?? []
        list.push(p)
        byAccount.set(p.accountId, list)
      }
      return { ok: true, data: rows.map((r) => toAccountDto(r, byAccount.get(r.id) ?? [])) }
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

      // No phases supplied → synthesize one per step from the single values,
      // exactly like the 0016 migration backfill (older callers stay valid).
      const phaseInputs: AccountPhaseInput[] = (
        d.phases ??
        Array.from({ length: d.stepCount }, (_, i) => ({
          phaseNumber: i + 1,
          profitTargetPct: d.profitTargetPct > 0 ? d.profitTargetPct : null,
          dailyDrawdownType: d.dailyDrawdownType,
          dailyDrawdownValue: d.dailyDrawdownValue,
          totalDrawdownType: d.totalDrawdownType,
          totalDrawdownValue: d.totalDrawdownValue,
          minTradingDays: d.minTradingDays ?? null,
          maxTradingDays: d.maxTradingDays ?? null,
          consistencyRulePct: d.consistencyRulePct ?? null,
        }))
      ).map((p) => ({
        // Trading-day + consistency limits are account-wide in the UI (no
        // per-phase field yet); inherit the top-level values wherever a supplied
        // phase omits them, so both the stored phase rows AND the denormalized
        // active phase keep them (matches the synthesized path + 0016 backfill).
        ...p,
        minTradingDays: p.minTradingDays ?? d.minTradingDays ?? null,
        maxTradingDays: p.maxTradingDays ?? d.maxTradingDays ?? null,
        consistencyRulePct: p.consistencyRulePct ?? d.consistencyRulePct ?? null,
      }))

      const activePhase = phaseInputs[d.currentPhase - 1]
      if (!activePhase) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'currentPhase has no matching phase entry.' },
        }
      }

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
            drawdownBasis: d.drawdownBasis,
            // Denormalization contract: the single columns mirror the ACTIVE phase.
            ...denormFromPhase(activePhase),
            weekendHoldingAllowed: d.weekendHoldingAllowed ? 1 : 0,
            newsTradingAllowed: d.newsTradingAllowed ? 1 : 0,
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

        for (const p of phaseInputs) {
          db.insert(schema.accountPhases)
            .values({
              id: uuidv7(),
              accountId,
              phaseNumber: p.phaseNumber,
              profitTargetPct: p.profitTargetPct,
              dailyDrawdownType: p.dailyDrawdownType,
              dailyDrawdownValue: p.dailyDrawdownValue,
              totalDrawdownType: p.totalDrawdownType,
              totalDrawdownValue: p.totalDrawdownValue,
              minTradingDays: p.minTradingDays ?? null,
              maxTradingDays: p.maxTradingDays ?? null,
              consistencyRulePct: p.consistencyRulePct ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .run()
        }

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

      const row = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Account not persisted' } }
      const phases = loadPhases(db, accountId)
      enqueueSyncOp('accounts', accountId, 'upsert', row)
      for (const p of phases) enqueueSyncOp('account_phases', p.id, 'upsert', p)
      return { ok: true, data: toAccountDto(row, phases) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('accounts:delete', (_e, raw: unknown): IpcResponse<{ ok: true }> => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      db.update(schema.accounts)
        .set({ deletedAt: Date.now(), updatedAt: Date.now() })
        .where(eq(schema.accounts.id, parsed.data.id))
        .run()
      enqueueSyncOp('accounts', parsed.data.id, 'delete', null)
      return { ok: true, data: { ok: true } }
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
      if (fields.currentPhase !== undefined) {
        updateData.currentPhase = fields.currentPhase
        // Denormalization contract: moving the active phase re-mirrors that
        // phase's values onto the account row (when a phase row exists).
        const phase = db
          .select()
          .from(schema.accountPhases)
          .where(
            and(
              eq(schema.accountPhases.accountId, id),
              eq(schema.accountPhases.phaseNumber, fields.currentPhase),
              isNull(schema.accountPhases.deletedAt),
            ),
          )
          .get()
        if (phase) Object.assign(updateData, denormFromPhase(phase))
      }
      if (fields.leverage !== undefined) updateData.leverage = fields.leverage
      if (fields.currentEquityCents !== undefined)
        updateData.currentEquityCents = fields.currentEquityCents
      if (fields.peakEquityCents !== undefined) updateData.peakEquityCents = fields.peakEquityCents
      if ('notes' in fields) updateData.notes = fields.notes ?? null
      db.update(schema.accounts).set(updateData).where(eq(schema.accounts.id, id)).run()
      const row = db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get()
      if (!row) return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
      enqueueSyncOp('accounts', id, 'upsert', row)
      return { ok: true, data: toAccountDto(row, loadPhases(db, id)) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('accounts:advancePhase', (_e, raw: unknown): IpcResponse<Account> => {
    const parsed = AdvancePhaseSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { accountId } = parsed.data
      const account = db
        .select()
        .from(schema.accounts)
        .where(and(eq(schema.accounts.id, accountId), isNull(schema.accounts.deletedAt)))
        .get()
      if (!account) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
      }
      if (account.currentPhase >= account.stepCount) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Account is already at its final phase.',
          },
        }
      }
      const nextNumber = account.currentPhase + 1
      const next = db
        .select()
        .from(schema.accountPhases)
        .where(
          and(
            eq(schema.accountPhases.accountId, accountId),
            eq(schema.accountPhases.phaseNumber, nextNumber),
            isNull(schema.accountPhases.deletedAt),
          ),
        )
        .get()
      if (!next) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Phase ${nextNumber} configuration not found for this account.`,
          },
        }
      }
      const now = Date.now()
      db.transaction(() => {
        db.update(schema.accounts)
          .set({
            currentPhase: nextNumber,
            ...denormFromPhase(next),
            updatedAt: now,
          })
          .where(eq(schema.accounts.id, accountId))
          .run()
      })
      const row = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Account not persisted' } }
      enqueueSyncOp('accounts', accountId, 'upsert', row)
      return { ok: true, data: toAccountDto(row, loadPhases(db, accountId)) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('accounts:updatePhases', (_e, raw: unknown): IpcResponse<Account> => {
    const parsed = UpdateAccountPhasesSchema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
    }
    try {
      const db = getDb()
      const { accountId, phases: phaseInputs } = parsed.data
      const account = db
        .select()
        .from(schema.accounts)
        .where(and(eq(schema.accounts.id, accountId), isNull(schema.accounts.deletedAt)))
        .get()
      if (!account) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
      }

      // Removing phases above the new length clamps the active phase back into range.
      const newCurrentPhase = Math.min(account.currentPhase, phaseInputs.length)
      const activeInput = phaseInputs.find((p) => p.phaseNumber === newCurrentPhase)
      if (!activeInput) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Active phase has no matching entry.' },
        }
      }

      const now = Date.now()
      const existing = loadPhases(db, accountId)
      const removed = existing.filter((r) => r.phaseNumber > phaseInputs.length)

      db.transaction(() => {
        const byNumber = new Map(existing.map((r) => [r.phaseNumber, r]))
        for (const p of phaseInputs) {
          const current = byNumber.get(p.phaseNumber)
          const values = {
            profitTargetPct: p.profitTargetPct,
            dailyDrawdownType: p.dailyDrawdownType,
            dailyDrawdownValue: p.dailyDrawdownValue,
            totalDrawdownType: p.totalDrawdownType,
            totalDrawdownValue: p.totalDrawdownValue,
            // No per-phase UI field for these limits — when the input omits them,
            // preserve the existing phase row's value (editing target/DD must not
            // silently wipe them); a brand-new phase falls back to null.
            minTradingDays: p.minTradingDays ?? current?.minTradingDays ?? null,
            maxTradingDays: p.maxTradingDays ?? current?.maxTradingDays ?? null,
            consistencyRulePct: p.consistencyRulePct ?? current?.consistencyRulePct ?? null,
            updatedAt: now,
          }
          if (current) {
            db.update(schema.accountPhases)
              .set(values)
              .where(eq(schema.accountPhases.id, current.id))
              .run()
          } else {
            db.insert(schema.accountPhases)
              .values({
                id: uuidv7(),
                accountId,
                phaseNumber: p.phaseNumber,
                ...values,
                createdAt: now,
              })
              .run()
          }
        }
        for (const r of removed) {
          db.update(schema.accountPhases)
            .set({ deletedAt: now, updatedAt: now })
            .where(eq(schema.accountPhases.id, r.id))
            .run()
        }
        // stepCount stays in sync with the phase count; the active phase's
        // values are re-denormalized onto the account row (same trading-day /
        // consistency preservation as the per-phase upsert above).
        const activeExisting = byNumber.get(newCurrentPhase)
        const activeDenorm = {
          ...activeInput,
          minTradingDays: activeInput.minTradingDays ?? activeExisting?.minTradingDays ?? null,
          maxTradingDays: activeInput.maxTradingDays ?? activeExisting?.maxTradingDays ?? null,
          consistencyRulePct:
            activeInput.consistencyRulePct ?? activeExisting?.consistencyRulePct ?? null,
        }
        db.update(schema.accounts)
          .set({
            stepCount: phaseInputs.length,
            currentPhase: newCurrentPhase,
            ...denormFromPhase(activeDenorm),
            updatedAt: now,
          })
          .where(eq(schema.accounts.id, accountId))
          .run()
      })

      const row = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get()
      if (!row) return { ok: false, error: { code: 'DB_ERROR', message: 'Account not persisted' } }
      const survivors = loadPhases(db, accountId)
      enqueueSyncOp('accounts', accountId, 'upsert', row)
      for (const p of survivors) enqueueSyncOp('account_phases', p.id, 'upsert', p)
      for (const r of removed) enqueueSyncOp('account_phases', r.id, 'delete', null)
      return { ok: true, data: toAccountDto(row, survivors) }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
