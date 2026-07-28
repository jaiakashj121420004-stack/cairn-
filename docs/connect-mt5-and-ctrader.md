# Connecting Cairn to MetaTrader 5 and cTrader — Step-by-Step

This guide assumes you have never done this before. Follow it top to bottom, in order. Do not skip steps — MT5 and cTrader both have one "gotcha" step each that silently blocks the connection if missed (they're marked ⚠️ below).

Two separate things happen when you connect a broker:
1. **The connection** — Cairn and your broker start talking.
2. **Account mapping** — you tell Cairn which of *your* Cairn accounts a broker account belongs to. Until you do this, fills are held and no trade is created. This is intentional — Cairn never guesses.

### Part 0 — before you start (fresh installs only)

If this is a brand-new Cairn install with no accounts yet, Part C (account mapping) will have nothing to bind to. Create at least one account first:

1. Open **Cairn → Accounts** (left sidebar).
2. Create an account (any name, e.g. "Demo" or "MT5 Test"), any starting balance/phase.

Once at least one account exists, come back here and start Part A.

---

## Part A — MetaTrader 5 (do this one first — it's easier and needs no waiting)

MT5 has no way for outside apps to talk to it over the internet, so Cairn uses a small helper file called an **Expert Advisor (EA)** that lives *inside* your MT5 terminal and reports your trades to Cairn over a connection that never leaves your computer.

### A1. Open the Cairn screen you'll need

1. Open **Cairn**.
2. Go to **Settings → Integrations**.
3. Scroll to the **MetaTrader 5 bridge** section. Leave this window open — you'll flip back to it several times.

You'll see a **Pairing token** (a long random code) and a **Listener address** like `127.0.0.1:53127`. Think of the pairing token as MT5's password to talk to Cairn — you'll paste it in shortly.

### A2. Install the EA into MT5 — one click

1. Open your MT5 terminal (any of your installed ones — MetaTrader 5, or a broker-branded one like BridgeMarkets/Eightcap/Goat Funded/MavenTrade — they all run the same way).
2. Back in Cairn's MT5 panel, click **Install Cairn EA**.
3. Cairn copies the bridge file into **every** MT5 terminal it detects on your machine at once, and lists each folder path with its own **Open** button. If you have several MT5 apps installed (e.g. MetaTrader 5 plus a few broker-branded ones), all of them get the EA in one click — it doesn't matter which one you actually open and use. You should see `CairnBridge.mq5` (and, if this build ships a pre-compiled one, `CairnBridge.ex5`) appear in the folder that opens.

If Cairn says "No MetaTrader 5 terminal detected yet," open your MT5 terminal first, then click **Install Cairn EA** again. If it still can't find it, do it manually: in MT5 go to **File → Open Data Folder → MQL5 → Experts**, and copy `CairnBridge.mq5` there yourself (Cairn shows you the file's location).

**If you (or MT5) accidentally deletes CairnBridge from the Navigator/Experts folder:** no need to hunt for the file — just go back to Cairn's MT5 panel and click **Install Cairn EA** again. It re-copies both files fresh, every time, harmlessly overwriting what's there.

### A3. Compile it inside MT5

Skip this step entirely if the panel already shows a `CairnBridge.ex5` file — that means it's pre-compiled and ready to use. Otherwise:

1. In MT5, press **F4** (or **Tools → MetaQuotes Language Editor**). This opens **MetaEditor**, a separate window.
2. In MetaEditor's left-hand **Navigator** panel, find **Experts → CairnBridge.mq5** and double-click to open it.
3. Press **F7** to compile. A box at the bottom should say `0 errors, 0 warnings`. If you see errors, don't attach the EA — something didn't copy correctly; redo step A2.
4. Close MetaEditor and go back to MT5. Under **Navigator → Expert Advisors** you should now see **CairnBridge** in the list.

### A4. ⚠️ Allow the local connection (the step people miss)

MT5 blocks any outside connection by default, even a local one. You must explicitly allow it:

1. In MT5: **Tools → Options → Expert Advisors** tab.
2. Tick the box **Allow algorithmic trading**.
3. Tick **Allow WebRequest for listed URL** (wording varies slightly by MT5 version) and in the list box add exactly:
   ```
   127.0.0.1
   ```
4. Click **OK**.

This "algorithmic trading" switch is MT5's generic master toggle for any EA — it doesn't mean the Cairn bridge can trade for you. It can't; it has no code to place, modify, or close an order, only to read and report.

### A5. Attach the EA to a chart and paste the token

1. Open any chart in MT5 (any symbol — the EA sees your whole account, not just that one chart).
2. In the **Navigator** panel, drag **CairnBridge** from **Expert Advisors** onto the chart. A settings dialog pops up.
3. Click the **Inputs** tab inside that dialog and fill in:
   - **InpToken** → paste the pairing token you copied from Cairn in step A1 (click **Copy** next to it in Cairn first).
   - **InpPort** → type the same port number Cairn showed you (default `53127`).
   - **InpHost** → leave as `127.0.0.1`.
   - **InpHeartbeatSec** → leave as `5`.
4. Click **OK**.
5. Look at the top-right corner of the chart: a small 🙂 smiley icon means the EA is running. A sad/frowning icon or a red ✕ means something is wrong — see Troubleshooting below.

### A6. Confirm it worked

Switch back to **Cairn → Settings → Integrations**. Within about 5–10 seconds:
- The dot next to **MetaTrader 5** at the top of the page turns green and says **Listening on 127.0.0.1:53127**.
- The MT5 panel's indicator changes to **EA connected**, and "last event" starts ticking.

If you place a trade (even a demo one), you'll see "last event: Ns ago" update.

**A note on login errors:** the EA bridge and your MT5 account login are two separate things. If MT5's **Journal** tab shows something like `authorization on MetaQuotes-Demo failed (Invalid account)`, that's a broker-login problem (wrong demo credentials, or a demo account that's expired) — it does **not** stop the EA from running or from reaching Cairn. You can confirm the bridge/heartbeat works even while logged out; you just won't see real trade fills until you're actually logged into a valid account.

### MT5 Troubleshooting

| Problem | Fix |
|---|---|
| Indicator stuck on "Disconnected — waiting for EA" | Check the smiley face on the chart isn't sad/red. Confirm **InpPort** matches Cairn's listener port exactly. Confirm `127.0.0.1` is in the allowed list (step A4) and algo trading is on. |
| MT5's **Experts** tab (bottom panel) shows `SocketConnect ... failed` | Step A4 wasn't saved properly — redo it, then remove the EA from the chart and drag it back on. |
| "Token rejected" in the Experts log | Re-copy the token from Cairn (it may have changed) and re-paste into **InpToken** — no leading/trailing spaces. |
| `0 errors, 0 warnings` doesn't appear in MetaEditor | The file didn't copy fully — delete it from `MQL5/Experts` and click **Install Cairn EA** again. |
| `Journal` shows `authorization ... failed (Invalid account)` | This is your MT5 login, unrelated to the Cairn bridge — see the note above. Fix by re-entering your demo account number/password/server in MT5's login dialog (right-click the account in the Navigator → **Login**), or open a fresh demo account via **File → Open an Account**. |
| CairnBridge disappeared from Navigator → Expert Advisors | It was deleted (by you, MT5, or a cleanup tool). Go back to Cairn → Settings → Integrations → **Install Cairn EA** and click it again — no need to track down the file yourself. |

---

## Part B — cTrader (takes longer — Spotware has to approve your app first)

Unlike MT5, cTrader has an official API, but you first have to register a small "application" with cTrader's parent company, **Spotware**, and wait for them to approve it. Budget a few business days for this approval before it works — the Cairn side takes two minutes, the waiting is on Spotware.

### B1. Register a free application with Spotware

1. In your browser, go to Spotware's **Open API** developer portal (search "cTrader Open API portal" if you don't have the link saved) and sign in with your cTrader account.
2. Create a new application. Give it any name (e.g. "Cairn").
3. Set the **Redirect URI** to exactly:
   ```
   http://127.0.0.1:53129/ctrader/callback
   ```
4. Under scopes/permissions, select **accounts** (read-only). Don't grant trading/write scopes — Cairn never needs them and never uses them.
5. Submit. Spotware will show you a **Client ID** and **Client Secret** — copy both somewhere safe (the secret is only shown once).

⚠️ New Spotware apps usually start in a "pending" or "needs approval" state and cannot complete the login flow until Spotware activates them (their KYC/review, typically a few business days). If step B3 below fails immediately with an error mentioning the app isn't active, that's why — nothing is wrong on your end, you just need to wait for Spotware.

### B2. Paste your credentials into Cairn

1. In Cairn, go to **Settings → Integrations → cTrader**.
2. You'll see fields for **Client ID** and **Client secret** (only shown if not already configured). Paste in what Spotware gave you.
3. Click **Save credentials**. Cairn stores the secret in your operating system's secure keychain — never as plain text, never in Cairn's database.

### B3. Connect your account

1. Still on the cTrader panel, choose **Environment**: **Demo** while you're testing, **Live** once you're ready to use your real account.
2. Click **Connect cTrader**. This opens your browser to Spotware's login page.
3. Log in with your cTrader credentials and approve access (read-only).
4. You'll be redirected back and the browser tab can be closed. In Cairn, the connection indicator should turn green ("Connected").
5. If you have more than one cTrader account under your login, a new **Account** dropdown appears — pick the one you want to link.
6. Click **Test connection** to confirm — Cairn will tell you how many trading accounts it can see.

### cTrader Troubleshooting

| Problem | Fix |
|---|---|
| Browser shows an error saying the app isn't active/approved | Spotware hasn't finished reviewing your application yet (step B1). Wait and try again in a day or two — nothing to fix on your side. |
| "Account linked — live streaming is unavailable in this build" toast | The account connected, but live event streaming isn't available yet in this Cairn build — this is a known limitation, not something you did wrong. |
| Can't find Client ID/Secret fields in Cairn | They only show up if Cairn doesn't already have credentials saved. If you need to change them, click **Clear credentials** first, then re-enter. |
| Nothing happens after clicking Connect cTrader | Check your default browser didn't block the popup/redirect. Try again, or copy the URL it opens directly into your browser. |

---

## Part C — Account mapping (do this for both brokers)

This is the last step and it's the same for MT5 and cTrader.

1. In Cairn, go to **Settings → Integrations** and scroll to **Account mapping**.
2. Place (or wait for) one trade on the connected broker account. Within a few seconds it will appear under **Waiting to be mapped** as a broker account ID with a count of "held events."
3. Use the dropdown next to it to pick which of your **Cairn accounts** (the ones you set up in Cairn's Accounts screen) this broker account belongs to.
4. Click **Bind**.

From this point on, every fill from that broker account automatically creates a Cairn trade — a **draft awaiting reflection** by default, or a **fully logged trade** if you switched the "When a broker fill arrives" setting at the top of the Integrations page to **Fully auto-logged**.

To change a binding later (e.g. you mapped it to the wrong account), find it under **Mapped accounts** further down the same page and change the dropdown, or click **Remove** to unbind it.

---

## What "connected" actually gets you

Once mapped, Cairn will:
- Auto-fill the mechanical facts of every trade (pair, direction, lot size, entry/stop/target, exit, partials) — no manual re-entry.
- Warn you in real time (a calm on-screen message, not a popup that blocks anything) if your live position drifts from your own rules — stop moved against you, size increased mid-trade, target cut short, over-trading past your daily limit, trading after a loss-limit lockout, or trading outside your configured session hours.

It will **never** place, modify, or close a trade for you — both bridges are read-only by design, and that's not going to change.

---

*Both bridges are optional. Cairn's manual trade log works exactly the same with or without a broker connected — connecting one just removes the retyping.*
