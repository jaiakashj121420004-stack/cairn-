import { eq } from 'drizzle-orm'
import { ipcMain } from 'electron'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type {
  IpcResponse,
  AccountTemplate,
  CreateAccountTemplateInput,
  UpdateAccountTemplateInput,
} from '../../shared/types/index'

const DrawdownTypeSchema = z.enum(['percent_of_balance', 'percent_of_equity', 'fixed_amount'])
const DrawdownBasisSchema = z.enum(['initial_balance', 'high_water_mark', 'previous_day_close'])

const CreateAccountTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  propFirmId: z.string().uuid(),
  stepCount: z.number().int().min(1).max(5),
  accountSizeCents: z.number().int().positive(),
  leverage: z.number().int().min(1).max(2000),
  dailyDrawdownType: DrawdownTypeSchema,
  dailyDrawdownValue: z.number().int().positive(),
  totalDrawdownType: DrawdownTypeSchema,
  totalDrawdownValue: z.number().int().positive(),
  drawdownBasis: DrawdownBasisSchema,
  profitTargetPhase1Pct: z.number().int().positive(),
  profitTargetPhase2Pct: z.number().int().positive().optional(),
  profitTargetPhase3Pct: z.number().int().positive().optional(),
  minTradingDays: z.number().int().min(0).optional(),
  maxTradingDays: z.number().int().min(0).optional(),
  weekendHoldingAllowed: z.boolean(),
  newsTradingAllowed: z.boolean(),
  consistencyRulePct: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
})

const UpdateAccountTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  isArchived: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export function registerAccountTemplateHandlers(): void {
  ipcMain.handle('accountTemplates:list', (): IpcResponse<AccountTemplate[]> => {
    try {
      const db = getDb()
      const rows = db.select().from(schema.accountTemplates).all()
      return { ok: true, data: rows as AccountTemplate[] }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle(
    'accountTemplates:create',
    (_e, raw: CreateAccountTemplateInput): IpcResponse<AccountTemplate> => {
      const parsed = CreateAccountTemplateSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const now = Date.now()
        const id = uuidv7()
        const d = parsed.data
        db.insert(schema.accountTemplates)
          .values({
            id,
            name: d.name,
            propFirmId: d.propFirmId,
            stepCount: d.stepCount,
            accountSizeCents: d.accountSizeCents,
            leverage: d.leverage,
            dailyDrawdownType: d.dailyDrawdownType,
            dailyDrawdownValue: d.dailyDrawdownValue,
            totalDrawdownType: d.totalDrawdownType,
            totalDrawdownValue: d.totalDrawdownValue,
            drawdownBasis: d.drawdownBasis,
            profitTargetPhase1Pct: d.profitTargetPhase1Pct,
            profitTargetPhase2Pct: d.profitTargetPhase2Pct ?? null,
            profitTargetPhase3Pct: d.profitTargetPhase3Pct ?? null,
            minTradingDays: d.minTradingDays ?? null,
            maxTradingDays: d.maxTradingDays ?? null,
            weekendHoldingAllowed: d.weekendHoldingAllowed ? 1 : 0,
            newsTradingAllowed: d.newsTradingAllowed ? 1 : 0,
            consistencyRulePct: d.consistencyRulePct ?? null,
            notes: d.notes ?? null,
            isArchived: 0,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        const row = db
          .select()
          .from(schema.accountTemplates)
          .where(eq(schema.accountTemplates.id, id))
          .get()
        return { ok: true, data: row as AccountTemplate }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'accountTemplates:update',
    (_e, raw: UpdateAccountTemplateInput): IpcResponse<AccountTemplate> => {
      const parsed = UpdateAccountTemplateSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const { id, ...fields } = parsed.data
        const updateData: Partial<typeof schema.accountTemplates.$inferInsert> = {
          updatedAt: Date.now(),
        }
        if (fields.name !== undefined) updateData.name = fields.name
        if (fields.isArchived !== undefined) updateData.isArchived = fields.isArchived ? 1 : 0
        if ('notes' in fields) updateData.notes = fields.notes ?? null
        db.update(schema.accountTemplates)
          .set(updateData)
          .where(eq(schema.accountTemplates.id, id))
          .run()
        const row = db
          .select()
          .from(schema.accountTemplates)
          .where(eq(schema.accountTemplates.id, id))
          .get()
        if (!row) {
          return { ok: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }
        }
        return { ok: true, data: row as AccountTemplate }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
