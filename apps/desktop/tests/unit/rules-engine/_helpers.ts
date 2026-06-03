import type { Account } from '../../../shared/types/index'
import type {
  AccountRuleConfig,
  CooldownRecord,
  DraftTrade,
  KillzoneRecord,
  RuleContext,
  SessionRecord,
  TradeModification,
  TradeRecord,
} from '../../../electron/services/rules-engine/types'

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    displayName: 'Test Account',
    templateId: null,
    propFirmId: 'firm-1',
    stepCount: 2,
    currentPhase: 1,
    accountSizeCents: 5_000_000, // $50k
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
    startDate: Date.UTC(2026, 0, 1),
    status: 'active',
    endDate: null,
    endReason: null,
    peakEquityCents: 5_000_000,
    currentEquityCents: 5_000_000,
    notes: null,
    createdAt: Date.UTC(2026, 0, 1),
    updatedAt: Date.UTC(2026, 0, 1),
    deletedAt: null,
    ...overrides,
  }
}

export function makeAccountRule(
  ruleKey: string,
  value: Record<string, unknown>,
  enabled = 1,
  priority = 10,
): AccountRuleConfig {
  return {
    id: `ar-${ruleKey}`,
    accountId: 'acct-1',
    ruleKey,
    enabled,
    value: JSON.stringify(value),
    priority,
    createdAt: 0,
    updatedAt: 0,
  }
}

export function makeDraft(overrides: Partial<DraftTrade> = {}): DraftTrade {
  return {
    accountId: 'acct-1',
    sessionId: 'sess-1',
    pairId: 'pair-eurusd',
    setupId: 'setup-fvg',
    killzoneId: 'kz-london',
    direction: 'long',
    mode: 'live' as const,
    entryPrice: 10_800_0,
    stopLossPrice: 10_790_0,
    takeProfitPrice: 10_820_0,
    slPips: 100,
    rrRatio: 200,
    lotSize: 50,
    riskAmountCents: 10000, // $100
    riskPctBps: 100, // 1%
    plannedInvalidation: 'Price closes below the 1H FVG low with conviction.',
    mssConfirmed: 1,
    htfBiasAligned: 1,
    dxyAligned: 1,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 2,
    plannedLotSize: 50,
    timestamp: Date.UTC(2026, 3, 20, 8, 30), // 08:30 UTC Monday (London killzone)
    ...overrides,
  }
}

export function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 'trade-1',
    accountId: 'acct-1',
    sessionId: 'sess-1',
    pairId: 'pair-eurusd',
    setupId: 'setup-fvg',
    killzoneId: 'kz-london',
    mode: 'live',
    direction: 'long',
    status: 'closed',
    entryPrice: 108000,
    stopLossPrice: 107900,
    takeProfitPrice: 108200,
    slPips: 100,
    rrRatio: 200,
    lotSize: 50,
    riskAmountCents: 10000,
    riskPctBps: 100,
    plannedInvalidation: 'x',
    mssConfirmed: 1,
    htfBiasAligned: 1,
    dxyAligned: 1,
    smtConfirmed: null,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 2,
    exitPrice: 107900,
    exitTime: Date.UTC(2026, 3, 20, 9, 0),
    exitReason: 'sl',
    pnlCents: -10000,
    pnlR: -100,
    createdAt: Date.UTC(2026, 3, 20, 8, 0),
    updatedAt: Date.UTC(2026, 3, 20, 9, 0),
    ...overrides,
  }
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'sess-1',
    accountId: 'acct-1',
    sessionDate: '2026-04-20',
    dailyBias: 'bullish',
    h4Bias: 'bullish',
    h1Bias: 'bullish',
    dxyBias: 'bearish',
    smtNotes: null,
    lockedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function makeCooldown(overrides: Partial<CooldownRecord> = {}): CooldownRecord {
  return {
    id: 'cd-1',
    accountId: 'acct-1',
    reason: 'post_loss',
    startedAt: Date.UTC(2026, 3, 20, 9, 0),
    expiresAt: Date.UTC(2026, 3, 20, 9, 30),
    clearedAt: null,
    clearedBy: null,
    acknowledgmentText: null,
    ...overrides,
  }
}

export function makeKillzones(): KillzoneRecord[] {
  return [
    { id: 'kz-london', name: 'London', startTimeUtc: '07:00', endTimeUtc: '10:00', active: 1 },
    { id: 'kz-ny', name: 'NY AM', startTimeUtc: '12:00', endTimeUtc: '15:00', active: 1 },
    { id: 'kz-asia', name: 'Asia', startTimeUtc: '00:00', endTimeUtc: '05:00', active: 1 },
  ]
}

export function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  const now = overrides.now ?? Date.UTC(2026, 3, 20, 8, 30)
  return {
    account: overrides.account ?? makeAccount(),
    accountRules: overrides.accountRules ?? [],
    currentSession:
      'currentSession' in overrides ? (overrides.currentSession ?? null) : makeSession(),
    tradeInProgress: overrides.tradeInProgress,
    mode: overrides.mode ?? 'live',
    tradeModification: overrides.tradeModification,
    tradeUnderModification: overrides.tradeUnderModification,
    tradesToday: overrides.tradesToday ?? [],
    recentTrades: overrides.recentTrades ?? [],
    now,
    timeZone: overrides.timeZone ?? 'America/New_York',
    activeCooldowns: overrides.activeCooldowns ?? [],
    killzones: overrides.killzones ?? makeKillzones(),
    tradingDaysCount: overrides.tradingDaysCount,
  }
}

export function makeModification(overrides: Partial<TradeModification> = {}): TradeModification {
  return {
    field: 'stop_loss_price',
    currentValue: 107900,
    newValue: 107800,
    ...overrides,
  }
}
