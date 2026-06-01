// @vitest-environment node
import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { v7 as uuidv7 } from 'uuid'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../../electron/db/schema'
import type { CairnDb } from '../../../electron/db/index'

const MIGRATIONS = [
  readFileSync(join(__dirname, '../../../electron/db/migrations/0001_initial.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0002_v11.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0003_opened_at.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0004_consolidate_partials.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0005_dismissed_insights.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0006_notebook.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0007_notebook_account.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0008_external_ref.sql'), 'utf-8'),
  readFileSync(join(__dirname, '../../../electron/db/migrations/0009_phase2.sql'), 'utf-8'),
]

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

export async function ensureSqlJs(): Promise<void> {
  if (!SQL) SQL = await initSqlJs()
}

export interface TestDbBundle {
  db: CairnDb
  raw: ReturnType<NonNullable<typeof SQL>['Database']['prototype']['constructor']>
  ids: {
    propFirmId: string
    accountId: string
    pairId: string
    setupId: string
    killzoneId: string
    sessionId: string
  }
}

export function createTestDb(): TestDbBundle {
  if (!SQL) throw new Error('Call await ensureSqlJs() in beforeAll/beforeEach first')
  const sqlite = new SQL.Database()
  for (const migration of MIGRATIONS) {
    for (const stmt of migration.split('--> statement-breakpoint')) {
      const t = stmt.trim()
      if (t) sqlite.run(t)
    }
  }
  const drizzleDb = drizzle(sqlite, { schema })
  // Cast: same sync interface; production code is typed against better-sqlite3.
  const db = drizzleDb as unknown as CairnDb

  const propFirmId = uuidv7()
  const pairId = uuidv7()
  const setupId = uuidv7()
  const killzoneId = uuidv7()
  const accountId = uuidv7()
  const sessionId = uuidv7()
  const ts = Date.UTC(2026, 0, 1)

  db.insert(schema.propFirms)
    .values({
      id: propFirmId,
      name: 'Custom',
      defaultStepCount: 2,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    })
    .run()

  db.insert(schema.pairs)
    .values({
      id: pairId,
      symbol: 'EURUSD',
      displayName: 'EUR / USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: null,
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run()

  db.insert(schema.setups)
    .values({
      id: setupId,
      name: 'FVG',
      category: 'ict',
      description: null,
      color: '#888',
      active: 1,
      displayOrder: 1,
      createdAt: ts,
      updatedAt: ts,
    })
    .run()

  db.insert(schema.killzones)
    .values({
      id: killzoneId,
      name: 'London',
      startTimeUtc: '07:00',
      endTimeUtc: '10:00',
      color: '#888',
      active: 1,
      displayOrder: 1,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run()

  db.insert(schema.accounts)
    .values({
      id: accountId,
      displayName: 'Test',
      templateId: null,
      propFirmId,
      stepCount: 2,
      currentPhase: 1,
      accountSizeCents: 5_000_000,
      leverage: 30,
      dailyDrawdownType: 'percent_of_balance',
      dailyDrawdownValue: 400,
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: 800,
      drawdownBasis: 'initial_balance',
      profitTargetPct: 800,
      minTradingDays: null,
      maxTradingDays: null,
      weekendHoldingAllowed: 0,
      newsTradingAllowed: 0,
      consistencyRulePct: null,
      challengeCostCents: 30000,
      startDate: ts,
      status: 'active',
      endDate: null,
      endReason: null,
      peakEquityCents: 5_000_000,
      currentEquityCents: 5_000_000,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    })
    .run()

  db.insert(schema.sessions)
    .values({
      id: sessionId,
      accountId,
      sessionDate: '2026-04-20',
      dailyBias: 'bullish',
      dailyBiasReason: 'r',
      h4Bias: 'bullish',
      h4BiasReason: 'r',
      h1Bias: 'bullish',
      h1BiasReason: 'r',
      htfLiquidityTarget: null,
      dxyBias: 'bearish',
      smtNotes: null,
      sessionPlan: null,
      keyLevels: null,
      lockedAt: null,
      createdAt: ts,
      updatedAt: ts,
    } as typeof schema.sessions.$inferInsert)
    .run()

  return {
    db,
    raw: sqlite,
    ids: { propFirmId, accountId, pairId, setupId, killzoneId, sessionId },
  }
}

export function insertAccountRule(
  db: CairnDb,
  accountId: string,
  ruleKey: string,
  config: Record<string, unknown>,
  enabled = 1,
): void {
  db.insert(schema.accountRules)
    .values({
      id: uuidv7(),
      accountId,
      ruleKey,
      enabled,
      value: JSON.stringify(config),
      priority: 10,
      createdAt: 0,
      updatedAt: 0,
    })
    .run()
}

export { schema }
// Cast helper for tests where we want better-sqlite3 typing parity
export type { BetterSQLite3Database }
