# Cairn Bridge for MetaTrader 5 — Install Guide

The Cairn Bridge is a small, **read-only** Expert Advisor (EA) that runs inside
your MetaTrader 5 terminal and forwards your fills to the Cairn desktop app over
a local connection on your own machine. It never places, modifies, or closes an
order — it only watches and reports. Nothing leaves your computer: Cairn listens
on `127.0.0.1` (loopback) only.

Setup takes about two minutes.

---

## 1. Open Cairn → Settings → Integrations → MT5

You'll see three things you need:

- **Pairing token** — a long random string. Click **Copy**.
- **Listener address** — `127.0.0.1:<port>` (default port `53127`).
- **Install path** — where your terminal's `MQL5/Experts` folder lives.

Keep this screen open; you'll come back to watch the connection indicator.

## 2. Install the EA into your terminal

**Easiest — one click.** In Cairn's MT5 panel, click **Install Cairn EA**. Cairn
copies `CairnBridge.mq5` into every MetaTrader 5 Experts folder it detects and opens
the folder for you. Then skip to step 3.

**Manual** (only if Cairn didn't detect your terminal):

1. In MetaTrader 5: **File → Open Data Folder**.
2. Go into **MQL5 → Experts**.
3. Copy **`CairnBridge.mq5`** (next to this guide) into that folder.

## 3. Compile it

1. In MetaTrader 5: **Tools → MetaQuotes Language Editor** (or press **F4**).
2. In the Navigator, open **Experts → CairnBridge.mq5**.
3. Press **F7** (Compile). You should see `0 errors, 0 warnings`.
4. Back in MT5, the EA now appears under **Navigator → Expert Advisors**.

## 4. Allow the local connection

MetaTrader blocks socket connections until you allow the address:

1. **Tools → Options → Expert Advisors**.
2. Tick **Allow algorithmic trading**.
3. Tick **Allow WebRequest / connections to listed URLs** and add:
   ```
   127.0.0.1
   ```
4. Click **OK**.

> Note: "Allow algorithmic trading" is MT5's master switch for EAs. The Cairn
> Bridge uses it only to run and read — it contains no trading code.

## 5. Attach the EA and paste your token

1. Drag **CairnBridge** from the Navigator onto any open chart.
2. In the dialog's **Inputs** tab, set:
   - **InpToken** → paste the pairing token from Cairn (step 1).
   - **InpPort** → match the port shown in Cairn (default `53127`).
   - **InpHost** → leave as `127.0.0.1`.
   - **InpHeartbeatSec** → leave as `5`.
3. Click **OK**. A smiley face in the chart's top-right corner means the EA is
   running.

## 6. Confirm the connection

Switch back to Cairn → Settings → Integrations → MT5. Within a few seconds the
indicator should turn to **EA connected**, and "last event" updates as fills
arrive.

---

## How your trades are recorded

Open **Settings → Integrations → "When a broker fill arrives"** to choose:

- **Draft awaiting context** (recommended) — Cairn fills the mechanical facts
  (pair, direction, lots, prices, times, partials) and drops the trade into the
  reflection queue on the Review screen. You add the honesty fields later. Cairn
  never fills those in for you.
- **Fully auto-logged** — the trade is written complete and never queued. Its
  honesty fields stay *unreviewed* (never counted as a clean trade).

Auto-log is **capture, not prevention**. By the time a fill reaches Cairn, the
order is already live at the broker — the bridge records what happened; it
cannot block a trade. The rule engine and hard locks run in Cairn's New Trade
panel, not here.

## Troubleshooting

- **Indicator stays "Disconnected".**
  - Check the EA smiley face is present (not a sad face / × ).
  - Confirm **InpPort** in the EA matches the port in Cairn.
  - Confirm `127.0.0.1` is in the allowed list (step 4) and algo trading is on.
  - Check the MT5 **Experts** tab (bottom panel) for `CairnBridge:` log lines.
- **"SocketConnect ... failed".** The address isn't allowed yet — redo step 4,
  then remove and re-attach the EA.
- **Token rejected.** Re-copy the token from Cairn and paste it into
  **InpToken** exactly (no surrounding spaces).

## Privacy & safety

- The bridge is **read-only, forever**. It has no `OrderSend` / `OrderModify` /
  `OrderClose` code path — a test in the Cairn source proves this.
- The connection is **loopback-only** (`127.0.0.1`). Cairn refuses any
  non-local connection and any frame without your pairing token.
- Nothing about your trading is sent off your machine.
