> Split from CLAUDE.md — Section 11: FUTURE INTEGRATIONS (V2)

## 11. FUTURE INTEGRATIONS (V2)

### 11.1 MT5/cTrader Integration Architecture

> **The live-broker design is now a binding plan, not a someday-idea.** Full source of truth: **`docs/broker-integration.md`** (transports, `BrokerEvent` contract, auto-log model, live detection, dedupe, security). Build prompts: `prompts.md` §8.7. This section keeps the historical adapter sketch plus a pointer to the decided design.

**Decided design (Wave 4):**
- **MT5 → local Expert Advisor → `127.0.0.1` socket bridge.** A read-only EA inside the terminal pushes fills to a loopback-only, token-authenticated Cairn listener. On-device, instant. (Chosen over the Windows-only, poll-based MT5 Python package.)
- **cTrader → official Open API** (OAuth 2.0, read-only scopes, streaming execution events; tokens in the OS keychain).
- Both normalise to one internal `BrokerEvent` stream consumed by an ingest service in the desktop main process.
- **Read-only, forever** — no adapter places, modifies, or closes a broker order (see §11.3).

**Statement-file import (Wave 3, already shipped — the free path):**
- `trades.broker_source`, `trades.broker_trade_id`, `trades.imported_at`, and `trades.external_ref` exist; `electron/services/import-adapters/` holds the MT5 / cTrader / TradingView parsers + a shared `_shared/` layer (symbol-resolver, committer, encoder, deduper).

**`BrokerAdapter` interface (extended for live in `docs/broker-integration.md` §4):**
```typescript
interface BrokerAdapter {
  name: string;
  authenticate(config: Record<string, unknown>): Promise<AuthResult>;
  fetchTrades(since: number): Promise<BrokerTrade[]>;
  mapToTrade(brokerTrade: BrokerTrade, context: ImportContext): Partial<Trade>;
  supportsLiveStream: boolean;
  streamTrades?(onTrade: (t: BrokerTrade) => void): Disposable;
}
// LiveBrokerAdapter (Wave 4) adds connect()/onEvent(BrokerEvent)/status()/disconnect().
```

**Adapters:**
- MT5 — live EA→socket bridge (Wave 4) + statement import (Wave 3, shipped).
- cTrader — live Open API (Wave 4) + statement import (Wave 3, shipped).
- TradingView — CSV import only (Wave 3, shipped); no live read API (fills execute at the connected broker).
- TradeLocker / Match-Trader — future adapters behind the same interface.

**Live capture flow:**
- User connects via Settings → Integrations (MT5: install EA + paste pairing token; cTrader: OAuth consent).
- New broker fills stream in as `BrokerEvent`s and auto-log per the configurable mode (`docs/broker-integration.md` §3): **draft-awaiting-context** (default; mechanical fields prefilled, lands in the reflection queue, honesty fields `unreviewed`) or **fully-auto** (complete record, never queued). Honesty data is never fabricated; the pre-trade gate is not run for streamed fills.
- The rule engine watches the live position and warns in real time on rule breaches (non-blocking — Cairn reads, never writes).
- Live trades dedupe against statement imports via `external_ref`.

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
