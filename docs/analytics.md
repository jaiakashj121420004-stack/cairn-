> Split from CLAUDE.md — Section 8: ANALYTICS — DETAILED SPEC

## 8. ANALYTICS — DETAILED SPEC

### 8.1 Filter Bar (Persistent)

Every analytics tab respects the global filter bar:
- Date range (presets: Today, Last 7d, Last 30d, This Month, Last Month, All Time, Custom)
- Account (All / specific)
- Mode (Live / Sim / Backtest / All)
- Pair (multi-select)
- Setup (multi-select)
- Killzone (multi-select)
- Clean trades only (toggle)

Filters persist across tabs within a session.

### 8.2 Tab 1 — Performance

**Top stat row:**
- Total trades, Win rate, Expectancy (R), Total R, Net P&L $, Net P&L %, Profit factor.

**Equity curve chart:**
- Line chart showing cumulative P&L over the filtered range.
- Toggle: in $ or in R.
- Overlays: max drawdown shaded region; account DD limit horizontal line.

**Distribution chart:**
- Histogram of R-multiples per trade.
- Color: red for losses, green for wins, gold bucket for break-even.

**Streak card:**
- Current streak (win/loss, count).
- Longest winning streak, longest losing streak.

**Daily breakdown heatmap:**
- Calendar-style heatmap showing daily P&L. Darker green = better day, darker red = worse.

### 8.3 Tab 2 — Rule Adherence (Primary Tab)

**Hero metric:**
- Rule Adherence Score % (large, center). Target: 95%+.
- Trend arrow vs previous period.

**Clean vs Dirty split:**
- Two cards side-by-side:
  - Clean trades: count, win rate, expectancy, total R.
  - Dirty trades: same stats.
- The difference between these two is often the most revealing number.

**Top rules broken (bar chart):**
- Horizontal bars showing frequency of each rule violation.
- Hover shows: when broken, resulting avg P&L.

**Rule-break impact table:**
- For each rule: # times broken, net P&L when broken, win rate when broken.
- Sorted by net impact.

**Blocked trades counter:**
- How many trades the engine prevented this period.
- What would their projected impact have been (estimated from past dirty-trade data).

**Adherence trend line:**
- Weekly adherence % over time.

### 8.4 Tab 3 — Setup Performance

**Setup × session matrix:**
- Grid: rows = setups, columns = killzones. Cell value = expectancy or win rate (toggle).
- Color-coded.

**By setup:**
- Bar chart: win rate by setup.
- Expectancy by setup.
- Avg RR achieved by setup.

**By day of week:**
- Win rate and expectancy per day.

**With MSS vs without MSS:**
- Side-by-side comparison cards.

**DXY aligned vs against:**
- Side-by-side comparison.

**SMT confirmed vs not:**
- Side-by-side.

### 8.5 Tab 4 — Behavioral

**Emotional state buckets:**
- Three cards: Calm (1-4 urgency), Neutral (5-7), Urgent (8-10).
- Each shows: # trades, win rate, expectancy.

**Need-to-work score bucket:**
- Same structure.

**Post-loss behavior:**
- First trade after a loss: win rate, expectancy.
- Second trade after a loss: win rate, expectancy.
- Revenge trades (flagged): separate card.

**Trade # of day:**
- Win rate/expectancy for trade 1, trade 2, trade 3+.
- Expected insight: trade 3+ is negative expectancy.

**Time of day heatmap:**
- Hourly grid × day of week. Expectancy per cell. Color-coded.

**Loss-then-win pattern tracker:**
- What % of recoveries are clean trades vs dirty.

### 8.6 Tab 5 — Accounts & Phases

**Account ladder:**
- Vertical list of all accounts, chronologically.
- Each row: name, firm, size, phase progression, days alive, outcome, cost.
- Clickable → account detail view.

**Phase pass rate trend:**
- Line chart: rolling Phase 1 pass rate, Phase 2 pass rate, overall funded rate.

**Cost analysis:**
- Total $ spent on challenge costs.
- Total $ earned from payouts (user-logged).
- Net position.
- Cost per trade across history.

**Cause of failure breakdown:**
- Pie chart: which rule was broken most on failed accounts.

**Days to failure distribution:**
- Histogram: how many days accounts typically survive before failing.

**Pattern insight cards:**
- Auto-generated insight text cards like:
  - "70% of your blown accounts broke `max_trades_per_day` rule within 48h of failure."
  - "Your Phase 2 failures have clean rate of 62%. Phase 2 successes: 94%."
  
These are computed from queries and displayed when statistically meaningful (min sample size).

### 8.7 Tab 6 — Review

- Weekly review form (v2 mandatory gate, v1 optional).
- List of past reviews.
- Monthly summary preview.
- Export review as PDF (v2).

### 8.8 Chart Standards

- Recharts throughout.
- Colors from design system only.
- No gridlines unless necessary; use subtle horizontal only.
- Tooltips: custom-styled, dark/light aware.
- Empty states: descriptive text + suggestion, never blank charts.
- Min data thresholds: hide or caveat stats with <10 trade samples.
