> Split from CLAUDE.md — Section 7: V1 FEATURES — FULL SPEC

> **Design note (2026-07-10):** where this spec says "JetBrains Mono" (numbers) or "Inter", read
> the current fonts — **IBM Plex Mono** for figures, **Spectral** for body, **Fraunces** for
> display — per Nvexis "The Almanac" (`docs/design-system.md § v3.0`, `DESIGN-GUIDELINES.md`).
> Behaviour/feature specs below are unchanged.

## 7. V1 FEATURES — FULL SPEC

### 7.1 Onboarding (First Launch)

**Flow:**
1. Welcome screen. "Cairn helps you trade the plan, not the emotion." Continue.
2. Create first prop firm (or skip — "Custom" exists). Name field, step count default.
3. Create first account template. Walk through size, DD rules, profit target. Optional.
4. Create first account (or defer). Asks: display name, template (if any), challenge cost.
5. Review default pairs/setups/killzones. Offer to customize now or later.
6. Choose theme (system/light/dark).
7. Choose backup folder. "Where should Cairn back up your data?" Default: `<Documents>/Cairn Backups`. Option to point at Google Drive/Dropbox folder.
8. Done. Land on Dashboard.

Stored in settings: `onboarding_completed: true`.

### 7.2 Dashboard (Main View)

**Layout (top to bottom):**

**Row 1 — Hero stats strip** (4 cards, responsive collapse):
- Discipline Ring (§4.9) — center-left, largest.
- Active Account summary — current equity, distance to DD, distance to profit target, phase progress bar.
- Today — trades taken, P&L, rules broken count, session state.
- Rolling expectancy — R-multiple expectancy over last 20 trades, with mini sparkline.

**Row 2 — Quick actions:**
- "Log Session Bias" (if today's session not started)
- "New Trade" (only clickable if session active and no locks)
- "Review Last Trade" (opens most recent closed trade)
- "Open Playbook" (opens setups reference)

**Row 3 — Recent trades table** — last 10, with inline clean/dirty badge, setup, RR, P&L. Click to open full trade detail.

**Row 4 — Session context card** — today's bias, DXY, key levels, if session logged. Editable until first trade is placed (then locked).

**Row 5 — Rule adherence preview** — small widget showing rule-break frequency this week.

All numbers animate in with count-up on first render.

### 7.3 Session Bias Entry

Modal or dedicated page. Required before first trade of the day (if `require_htf_bias_logged` rule is on).

**Fields:**
- Daily bias: Bullish / Bearish / Neutral (3 buttons, visually distinct)
- Daily reason: 1-line text (required)
- 4H bias: same
- 4H reason
- 1H bias: same
- 1H reason
- HTF liquidity target: text (optional but encouraged)
- DXY bias: Bullish / Bearish / Neutral / N/A
- SMT pair + notes (optional)
- Session plan: multi-line text (optional)
- Key levels: tag input, user types prices (e.g., `1.0842`, `1.0895`)

**Lock behavior:** Once the first trade is submitted for this session, the session bias becomes read-only. Edit button replaced with "Locked at [time]". This prevents retroactive narrative editing.

### 7.4 New Trade — Pre-Trade Flow

This is the most-used flow and must feel fast.

**Structure:** Right-side slide-over panel (420px wide), opens over dashboard. Escape or click-outside cancels with confirm if any data entered.

**Sections (top to bottom, all visible, no tabs):**

**Context (auto-filled, read-only):**
- Account (with phase badge)
- Session bias summary (one line)
- Trade # today (e.g., "Trade 2 of 2 max")
- Current daily P&L
- Active cooldowns (if any — blocks save button)

**Instrument & Setup:**
- Pair dropdown (searchable, shows recent first)
- Setup dropdown
- Killzone (auto-detected by current time, overridable)
- Mode (Live / Sim / Backtest) — defaults based on account type

**Direction:**
- Long / Short toggle (large, clear)

**Prices (three numeric inputs, JetBrains Mono):**
- Entry
- Stop Loss
- Take Profit

**Auto-computed (read-only, updates live as prices change):**
- SL in pips
- TP in pips
- Risk/Reward ratio (color-coded: red if <1.5, amber 1.5-2, green ≥2)
- Lot size (calculated from risk %)
- Risk in $ / %

**Confluence checkboxes (one-tap each):**
- ☐ MSS confirmed
- ☐ HTF bias aligned (auto-checked if direction matches session bias, user can uncheck)
- ☐ DXY aligned
- ☐ SMT confirmed (and a "with pair" sub-select)

**Invalidation (required textarea):**
- "This trade is wrong if: ____"
- Min 20 characters. Char count shown.
- Cannot submit without filling.

**Emotional state (3 sliders, 1-10):**
- Calm
- Urgency
- Need-this-to-work

**Rule check panel (bottom, always visible):**
- Live-updating as fields change.
- Shows each relevant rule with ✓ pass / ⚠ warning / ✗ block.
- If anything blocks: "CANNOT SUBMIT" button (disabled, red).
- If clear: "READY TO TRADE" button (enabled, accent A).

**Submit flow:**
- Click "Ready to Trade" → trade status = `planned`.
- Opens a confirmation mini-modal: "Order placed in broker? Once clicked, the session bias will lock and trade will be marked open." Two buttons: "Yes, it's placed" or "Actually, cancel".
- On "Yes" → trade status = `open`. Session locks. Dashboard updates.

**Save-as-draft option:** user can save incomplete trade as `planned` status and come back. Useful when watching for a setup that hasn't fully formed.

### 7.5 Trade Modification

When a trade is `open`:
- Detail view shows "Move SL" / "Move TP" / "Close Manually" / "Log Partial" actions.
- Moving SL against position triggers `no_sl_widening` rule.
- All modifications logged; `sl_moved`, `tp_moved` flags set.

### 7.6 Post-Trade Log

When marking a trade closed (from detail view or from a "Close Trade" button on the open-trades list):

**Fields:**
- Exit price (numeric)
- Exit time (auto = now, editable)
- Exit reason (dropdown: TP / SL / Manual / BE / Timeout / Partial-then-full)
- Max adverse excursion pips (optional)
- Max favorable excursion pips (optional)

**Auto-computed:** P&L in $, R, %, duration.

**Honesty section (required):**
- "Did I follow my plan exactly?" Yes/No radio.
- If No: "What did I change?" textarea.
- "Did I move SL?" Yes/No. If Yes: reason textarea.
- "Did I enter before MSS confirmed?" Yes/No.

**Rules broken checklist:**
- All account rules listed with checkbox. User ticks those they broke. (The engine also auto-detects several; user can add more.)

**Post-trade reflection:**
- Post-close calm score (1-10).
- "What I did right" (one sentence).
- "What I did wrong" (one sentence).
- Tags (free tag input).

**Screenshots:**
- Drag-drop or file picker. Up to 4 screenshots per trade (HTF context, entry, exit, review).
- Stored in `screenshots/<trade_id>/`.

**Submit:** Trade becomes `closed`. `is_clean` computed. Dashboard updates. Toast confirms.

### 7.7 Trade Log (History)

Full-screen table view with filters.

**Filters (left sidebar or top bar):**
- Date range
- Account
- Pair
- Setup
- Killzone
- Mode (live/sim/backtest)
- Clean vs Dirty
- Win/Loss/BE
- Tags

**Columns (sortable, user-configurable):**
- Date/Time, Pair, Setup, Killzone, Direction, Entry, SL, TP, RR, Risk%, Result, P&L $, P&L R, P&L %, Clean?, Rules Broken count, Duration

**Row actions:** View details, Duplicate as planned trade, Add note, Delete (soft delete).

**Bulk:** Export selected to CSV.

### 7.8 Trade Detail View

Click any trade → full view with:
- All fields in an organized layout.
- Screenshots gallery with lightbox.
- Rule evaluations that fired at submit time.
- Related trades (same day).
- Edit / Delete / Export.

### 7.9 Analytics (See §8 for detail)

Full analytics dashboard with 6 tabs. See Analytics section.

### 7.10 Accounts

List view of all accounts. Each shows:
- Display name, firm, size, phase, status.
- Current equity vs starting.
- DD used / available.
- Profit target progress.
- Days alive.
- Trades taken on this account.
- Clean rate on this account.

Actions per account: View dashboard (switches context), Edit, Mark as Passed, Mark as Failed (requires reason), Archive.

Create new account: uses template or custom.

### 7.11 Templates

Create, edit, archive account templates. Templates pre-fill new accounts quickly.

### 7.12 Settings

Tabbed:

**General:**
- Theme, language (English only v1), timezone, week starts on, number formatting region.

**Rules (per account, with global defaults):**
- Each built-in rule with toggle + config editor.
- Reset to defaults.
- Export/import rule profile (JSON).

**Pairs:**
- Manage list, add custom, edit pip decimal, reorder, archive.

**Setups:**
- Manage list, add custom, edit color, reorder, archive.

**Killzones:**
- Manage list, edit times, reorder, archive.

**Prop Firms:**
- Manage firms, add custom.

**Account Templates:**
- Manage templates.

**Backups:**
- Set backup folder.
- Set schedule (daily at X time, on app close, manual only).
- View backup log.
- Manual backup now.
- Restore from backup.

**Data:**
- Export all data (JSON/CSV).
- Open data folder (OS file explorer opens app data dir).
- Reset all data (destructive, requires typed confirmation).

**About:**
- Version, links to docs (local help files), credit line (Jai Akash).

### 7.13 Help / Playbook

Local markdown viewer with:
- Built-in reference for ICT concepts (user-editable).
- User's own playbook notes.
- Setup examples.
- Not a tutorial — a quick reference for during-trade thinking.

Stored as markdown files in app data folder; rendered with a markdown component.
