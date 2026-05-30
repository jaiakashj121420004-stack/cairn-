import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'
import { listActiveCooldowns } from './cooldowns'
import {
  getConfiguredTimeZone,
  tradingDayEnd,
  tradingDayKey,
  tradingDayStart,
} from '../time/trading-day'
import type {
  AccountRuleConfig,
  DraftTrade,
  KillzoneRecord,
  RuleContext,
  SessionRecord,
  TradeModification,
  TradeRecord,
} from './types'
import type { Account } from '../../../shared/types/index'

export function buildContext(
  db: CairnDb,
  accountId: string,
  opts: {
    now?: number
    draft?: DraftTrade
    modification?: TradeModification
    tradeUnderModificationId?: string
  } = {},
): RuleContext {
  const now = opts.now ?? Date.now()
  const timeZone = getConfiguredTimeZone(db)

  const account = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .get()
  if (!account) throw new Error(`Account not found: ${accountId}`)

  const accountRules = db
    .select()
    .from(schema.accountRules)
    .where(eq(schema.accountRules.accountId, accountId))
    .all() as AccountRuleConfig[]

  const todayStart = tradingDayStart(now, timeZone)
  const todayEnd = tradingDayEnd(now, timeZone)
  const tradesToday = db
    .select()
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.accountId, accountId),
        gte(schema.trades.createdAt, todayStart),
        lte(schema.trades.createdAt, todayEnd),
        isNull(schema.trades.deletedAt),
      ),
    )
    .all() as unknown as TradeRecord[]

  const recentTrades = db
    .select()
    .from(schema.trades)
    .where(and(eq(schema.trades.accountId, accountId), isNull(schema.trades.deletedAt)))
    .orderBy(schema.trades.createdAt)
    .all()
    .slice(-20) as unknown as TradeRecord[]

  const todayDateStr = tradingDayKey(now, timeZone)
  const sessionRow = db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.accountId, accountId),
        eq(schema.sessions.sessionDate, todayDateStr),
      ),
    )
    .get()
  const currentSession: SessionRecord | null = sessionRow
    ? {
        id: sessionRow.id,
        accountId: sessionRow.accountId,
        sessionDate: sessionRow.sessionDate,
        dailyBias: sessionRow.dailyBias as SessionRecord['dailyBias'],
        h4Bias: sessionRow.h4Bias as SessionRecord['h4Bias'],
        h1Bias: sessionRow.h1Bias as SessionRecord['h1Bias'],
        dxyBias: sessionRow.dxyBias as SessionRecord['dxyBias'],
        smtNotes: sessionRow.smtNotes,
        lockedAt: sessionRow.lockedAt,
        createdAt: sessionRow.createdAt,
        updatedAt: sessionRow.updatedAt,
      }
    : null

  const activeCooldowns = listActiveCooldowns(db, accountId, now)

  const killzones = db
    .select()
    .from(schema.killzones)
    .all()
    .map(
      (k): KillzoneRecord => ({
        id: k.id,
        name: k.name,
        startTimeUtc: k.startTimeUtc,
        endTimeUtc: k.endTimeUtc,
        active: k.active,
      }),
    )

  let tradeUnderModification: TradeRecord | undefined
  if (opts.tradeUnderModificationId) {
    const row = db
      .select()
      .from(schema.trades)
      .where(eq(schema.trades.id, opts.tradeUnderModificationId))
      .get()
    if (row) tradeUnderModification = row as unknown as TradeRecord
  }

  return {
    account: account as Account,
    accountRules,
    currentSession,
    tradeInProgress: opts.draft,
    mode: (opts.draft?.mode ?? 'live') as 'live' | 'sim' | 'backtest',
    tradeModification: opts.modification,
    tradeUnderModification,
    tradesToday,
    recentTrades,
    now,
    timeZone,
    activeCooldowns,
    killzones,
  }
}
