import { v7 as uuidv7 } from 'uuid'
import * as schema from './schema'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

type CairnDb = BetterSQLite3Database<typeof schema>

const NOW = Date.now()

export function runSeed(db: CairnDb): void {
  seedSettings(db)
  seedPropFirms(db)
  seedPairs(db)
  seedSetups(db)
  seedKillzones(db)
}

function seedSettings(db: CairnDb): void {
  const defaults = [
    { key: 'theme', value: JSON.stringify('system') },
    { key: 'timezone', value: JSON.stringify('') },
    { key: 'week_starts_on', value: JSON.stringify('monday') },
    { key: 'onboarding_completed', value: JSON.stringify(false) },
    { key: 'default_risk_pct', value: JSON.stringify(1) },
    { key: 'backup_schedule', value: JSON.stringify('daily') },
    { key: 'backup_folder_path', value: JSON.stringify('') },
    { key: 'default_pair', value: JSON.stringify('EURUSD') },
  ]

  for (const row of defaults) {
    db.insert(schema.settings)
      .values({ key: row.key, value: row.value, updatedAt: NOW })
      .onConflictDoNothing()
      .run()
  }
}

function seedPropFirms(db: CairnDb): void {
  const existing = db.select().from(schema.propFirms).limit(1).all()
  if (existing.length > 0) return

  db.insert(schema.propFirms)
    .values({
      id: uuidv7(),
      name: 'Custom',
      defaultStepCount: 2,
      notes: 'Default firm for custom accounts',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run()
}

function seedPairs(db: CairnDb): void {
  const pairs: Array<typeof schema.pairs.$inferInsert> = [
    {
      id: uuidv7(),
      symbol: 'EURUSD',
      displayName: 'EUR/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: JSON.stringify(['GBPUSD']),
      active: 1,
      displayOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'GBPUSD',
      displayName: 'GBP/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      correlatedWith: JSON.stringify(['EURUSD']),
      active: 1,
      displayOrder: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'USDJPY',
      displayName: 'USD/JPY',
      assetClass: 'forex',
      pipDecimal: 2,
      pipValuePerStandardLotCents: 900,
      active: 1,
      displayOrder: 3,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'AUDUSD',
      displayName: 'AUD/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 4,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'USDCAD',
      displayName: 'USD/CAD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 740,
      active: 1,
      displayOrder: 5,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'USDCHF',
      displayName: 'USD/CHF',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 900,
      active: 1,
      displayOrder: 6,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'NZDUSD',
      displayName: 'NZD/USD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 7,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'XAUUSD',
      displayName: 'XAU/USD',
      assetClass: 'commodities',
      pipDecimal: 2,
      pipValuePerStandardLotCents: 100,
      active: 1,
      displayOrder: 8,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'US30',
      displayName: 'US30',
      assetClass: 'indices',
      pipDecimal: 0,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 9,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'NAS100',
      displayName: 'NAS100',
      assetClass: 'indices',
      pipDecimal: 0,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 10,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'SPX500',
      displayName: 'SPX500',
      assetClass: 'indices',
      pipDecimal: 0,
      pipValuePerStandardLotCents: 1000,
      active: 1,
      displayOrder: 11,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'BTCUSD',
      displayName: 'BTC/USD',
      assetClass: 'crypto',
      pipDecimal: 0,
      pipValuePerStandardLotCents: 100,
      active: 1,
      displayOrder: 12,
      createdAt: NOW,
      updatedAt: NOW,
    },
    // v1.1 additions
    {
      id: uuidv7(),
      symbol: 'XAGUSD',
      displayName: 'XAG/USD',
      assetClass: 'commodities',
      pipDecimal: 2,
      pipValuePerStandardLotCents: 500,
      active: 1,
      displayOrder: 13,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'AUDNZD',
      displayName: 'AUD/NZD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 620,
      active: 1,
      displayOrder: 14,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'GBPJPY',
      displayName: 'GBP/JPY',
      assetClass: 'forex',
      pipDecimal: 2,
      pipValuePerStandardLotCents: 900,
      active: 1,
      displayOrder: 15,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'EURGBP',
      displayName: 'EUR/GBP',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 1270,
      active: 1,
      displayOrder: 16,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'EURJPY',
      displayName: 'EUR/JPY',
      assetClass: 'forex',
      pipDecimal: 2,
      pipValuePerStandardLotCents: 900,
      active: 1,
      displayOrder: 17,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'GBPCAD',
      displayName: 'GBP/CAD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 740,
      active: 1,
      displayOrder: 18,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      symbol: 'GBPAUD',
      displayName: 'GBP/AUD',
      assetClass: 'forex',
      pipDecimal: 4,
      pipValuePerStandardLotCents: 650,
      active: 1,
      displayOrder: 19,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]

  for (const pair of pairs) {
    db.insert(schema.pairs).values(pair).onConflictDoNothing().run()
  }
}

function seedSetups(db: CairnDb): void {
  const existing = db.select().from(schema.setups).limit(1).all()
  if (existing.length > 0) return

  const setups: Array<typeof schema.setups.$inferInsert> = [
    {
      id: uuidv7(),
      name: 'FVG',
      category: 'ICT',
      description:
        'Fair Value Gap — an imbalance between three candles where the middle body leaves a gap.',
      color: '#D4A24C',
      active: 1,
      displayOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Order Block',
      category: 'ICT',
      description:
        'Last opposing candle before a strong impulse move; institutional order concentration.',
      color: '#B4E048',
      active: 1,
      displayOrder: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Breaker Block',
      category: 'ICT',
      description: 'Former order block that has been violated; now acts as opposing structure.',
      color: '#6B9FFF',
      active: 1,
      displayOrder: 3,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Mitigation Block',
      category: 'ICT',
      description: 'A swing high or low that was the origin of a displacement move.',
      color: '#E8A33D',
      active: 1,
      displayOrder: 4,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Judas Swing',
      category: 'ICT',
      description:
        'Manipulation move at session open that sweeps liquidity before the true direction.',
      color: '#E25C5C',
      active: 1,
      displayOrder: 5,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'SMT Divergence',
      category: 'ICT',
      description: "Correlated pairs fail to confirm each other's swing, indicating manipulation.",
      color: '#9BA1A9',
      active: 1,
      displayOrder: 6,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Silver Bullet',
      category: 'ICT',
      description: 'Specific 1-hour setup within London or NY AM killzone targeting FVG after MSS.',
      color: '#E8EAED',
      active: 1,
      displayOrder: 7,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Liquidity Sweep Reversal',
      category: 'ICT',
      description: 'Price sweeps an obvious high or low, inducing stops, then reverses sharply.',
      color: '#D4A24C',
      active: 1,
      displayOrder: 8,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Turtle Soup',
      category: 'SMC',
      description:
        'Short-term reversal after a breakout of a 20-day high or low fails to follow through.',
      color: '#6B9FFF',
      active: 1,
      displayOrder: 9,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'Power of Three',
      category: 'ICT',
      description:
        'Accumulation, manipulation, distribution — the three-phase price delivery model.',
      color: '#B4E048',
      active: 1,
      displayOrder: 10,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]

  for (const setup of setups) {
    db.insert(schema.setups).values(setup).run()
  }
}

function seedKillzones(db: CairnDb): void {
  const existing = db.select().from(schema.killzones).limit(1).all()
  if (existing.length > 0) return

  const killzones: Array<typeof schema.killzones.$inferInsert> = [
    {
      id: uuidv7(),
      name: 'Asia',
      startTimeUtc: '00:00',
      endTimeUtc: '05:00',
      color: '#9BA1A9',
      active: 1,
      displayOrder: 1,
      notes: 'Low volume session; watch for accumulation and range building.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'London',
      startTimeUtc: '07:00',
      endTimeUtc: '10:00',
      color: '#6B9FFF',
      active: 1,
      displayOrder: 2,
      notes: 'Primary London session open. High probability setups at key levels.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'NY AM',
      startTimeUtc: '12:00',
      endTimeUtc: '15:00',
      color: '#B4E048',
      active: 1,
      displayOrder: 3,
      notes: 'New York session open. Highest volume. Strong continuation or reversal setups.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'London Silver Bullet',
      startTimeUtc: '09:00',
      endTimeUtc: '10:00',
      color: '#D4A24C',
      active: 1,
      displayOrder: 4,
      notes: 'Specific 1-hour ICT Silver Bullet window within London session.',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: uuidv7(),
      name: 'NY PM Silver Bullet',
      startTimeUtc: '19:00',
      endTimeUtc: '20:00',
      color: '#E8A33D',
      active: 1,
      displayOrder: 5,
      notes: 'Specific 1-hour ICT Silver Bullet window within NY PM session.',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]

  for (const kz of killzones) {
    db.insert(schema.killzones).values(kz).run()
  }
}
