# Public launch announcement (draft)

> Draft for the blog post + X/HN/Reddit launch (launch-checklist items 25, 26). **Hold until**
> the 14-day soft-launch trigger condition is met (§2.4: 5xx < 0.1% and no open P1s).
> Positioning per CLAUDE.md §17.5 #30 — prevention, not feature-for-feature parity.

---

## Blog post

**Title:** Cairn — a trading journal that changes what you do, not just what you record

Most trading journals are a record of what you already did. You take the bad trade, then you
write about the bad trade. The tool that was supposed to fix your discipline just documented
you breaking it.

Trading failure is usually not a knowledge problem — it's a discipline problem. You *know* the
rule. You break it anyway. You lose. You promise to follow the rule. You break it again.

Cairn is built to break that loop. It's an **external discipline layer**: a cockpit you trade
*through*, not a notebook you fill in *after*.

- **Prevention before the click.** Lot-size calculator, rule checks, and target validation run
  before you place the trade — not as a post-mortem.
- **Hard locks and circuit breakers.** Hit your daily loss limit and the session closes. Break
  a rule and you get friction, not a shrug.
- **Live, broker-aware discipline.** Connect MT5 or cTrader (read-only — Cairn never places or
  moves an order) and get real-time warnings the moment you widen a stop or over-trade.
- **Honest data, by design.** Fields that force self-awareness can't be skipped into "N/A."
- **Yours, and private.** Local-first — the desktop app works fully offline, forever, with no
  account. If you turn on sync, your data is end-to-end encrypted on your device. Our servers
  hold ciphertext they can't read.

Free forever on the desktop. **Cairn Pro** ($15/mo or $150/yr) adds the web app and
encrypted multi-device sync.

[Download] · [Pricing] · [How it works]

---

## Short social post (X / Reddit r/Forex, r/algotrading)

Built Cairn: a trading journal that stops the bad trade *before* you take it, not after.
Real-time rule checks, hard locks, a daily-loss circuit breaker, and live read-only MT5/cTrader
warnings when you widen a stop or over-trade. Local-first + end-to-end-encrypted sync — I can't
read your trades. Free on desktop. [link]

---

## HN post

**Show HN: Cairn — a discipline-first trading journal that prevents rule-breaking in real time**

I kept breaking my own trading rules and losing, so I built the tool I wanted: not a journal
that records what I did, but a cockpit that enforces my rules before the click — lot-size and
target checks, hard locks, a daily-loss circuit breaker, and live read-only broker warnings.
Local-first (works fully offline, no account) with optional end-to-end-encrypted sync where the
server can't read your data. Tech: Electron + React + TS, SQLite locally, Fastify + Postgres
backend, libsodium for client-side crypto. Happy to answer questions. [link]
