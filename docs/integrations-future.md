> Split from CLAUDE.md — Section 11: FUTURE INTEGRATIONS (V2)

## 11. FUTURE INTEGRATIONS (V2)

### 11.1 MT5/cTrader Integration Architecture

**v1 preparation:**
- `trades.broker_source`, `trades.broker_trade_id`, `trades.imported_at` exist from day 1.
- `electron/services/import-adapters/` folder exists with `manual.ts` placeholder.

**v2 adapter interface:**
```typescript
interface BrokerAdapter {
  name: string;
  authenticate(config: Record<string, unknown>): Promise<AuthResult>;
  fetchTrades(since: number): Promise<BrokerTrade[]>;
  mapToTrade(brokerTrade: BrokerTrade, context: ImportContext): Partial<Trade>;
  supportsLiveStream: boolean;
  streamTrades?(onTrade: (t: BrokerTrade) => void): Disposable;
}
```

**Adapters to build (v2):**
- MT5 (via Python bridge or REST API exposed by MT5 terminal)
- cTrader (via cTrader Open API)
- TradeLocker
- Match-Trader

**Import flow:**
- User connects account via Settings → Integrations.
- Adapter imports past trades (filtered to after a chosen date).
- Imported trades show "Broker import" badge; honesty fields and reflection still filled manually.
- Live stream: new broker trades auto-create `planned` trades for user to fill context on.

### 11.2 Other V2 Features (From §7.12 v2 list)

- Killzone heatmap (specified in §8.5; unlock full version in v2)
- Tilt detection expansions (24h auto-locks, consecutive-loss phrases)
- Pre-market bias journal expansion
- Backtest mode enhancements
- Mandatory weekly review (gating UI until completed)
- Screenshot flashcard review mode
- Monthly PDF export
- Goal/guardrail progress bars (detailed)
- User-defined custom rules builder

### 11.3 Never-Features (Intentionally Out of Scope)

- Social/community features
- Copy trading
- Broker order execution from Cairn
- News integration (explicitly descoped by user)
- AI-generated trade suggestions
- Automated strategy backtesting (different tool class)
