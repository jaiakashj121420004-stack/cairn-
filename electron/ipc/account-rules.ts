import { ipcMain } from 'electron'
import { z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import { getRule } from '../services/rules-engine/index'
import type {
  IpcResponse,
  AccountRuleConfigDTO,
  UpsertAccountRuleInput,
} from '../../shared/types/index'

const ListSchema = z.object({ accountId: z.string().min(1) })
const UpsertSchema = z.object({
  accountId: z.string().min(1),
  ruleKey: z.string().min(1),
  enabled: z.boolean(),
  value: z.record(z.unknown()),
})

export function registerAccountRulesHandlers(): void {
  ipcMain.handle(
    'accountRules:list',
    (_e, raw: { accountId: string }): IpcResponse<AccountRuleConfigDTO[]> => {
      const parsed = ListSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      try {
        const db = getDb()
        const rows = db
          .select()
          .from(schema.accountRules)
          .where(eq(schema.accountRules.accountId, parsed.data.accountId))
          .all()
        return { ok: true, data: rows as AccountRuleConfigDTO[] }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle(
    'accountRules:upsert',
    (_e, raw: UpsertAccountRuleInput): IpcResponse<AccountRuleConfigDTO> => {
      const parsed = UpsertSchema.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }
      }
      const rule = getRule(parsed.data.ruleKey)
      if (!rule) {
        return { ok: false, error: { code: 'UNKNOWN_RULE', message: `No rule: ${parsed.data.ruleKey}` } }
      }
      const configParsed = rule.configSchema.safeParse(parsed.data.value)
      if (!configParsed.success) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: configParsed.error.message },
        }
      }
      try {
        const db = getDb()
        const now = Date.now()
        const existing = db
          .select()
          .from(schema.accountRules)
          .where(
            and(
              eq(schema.accountRules.accountId, parsed.data.accountId),
              eq(schema.accountRules.ruleKey, parsed.data.ruleKey),
            ),
          )
          .get()
        if (existing) {
          db.update(schema.accountRules)
            .set({
              enabled: parsed.data.enabled ? 1 : 0,
              value: JSON.stringify(parsed.data.value),
              updatedAt: now,
            })
            .where(eq(schema.accountRules.id, existing.id))
            .run()
          const row = db
            .select()
            .from(schema.accountRules)
            .where(eq(schema.accountRules.id, existing.id))
            .get()
          return { ok: true, data: row as AccountRuleConfigDTO }
        }
        const id = uuidv7()
        db.insert(schema.accountRules)
          .values({
            id,
            accountId: parsed.data.accountId,
            ruleKey: parsed.data.ruleKey,
            enabled: parsed.data.enabled ? 1 : 0,
            value: JSON.stringify(parsed.data.value),
            priority: 1000,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        const row = db
          .select()
          .from(schema.accountRules)
          .where(eq(schema.accountRules.id, id))
          .get()
        return { ok: true, data: row as AccountRuleConfigDTO }
      } catch (err) {
        return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
      }
    },
  )
}
