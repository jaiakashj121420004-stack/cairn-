# Changelog

All notable, user-facing changes to Cairn. Format follows [Keep a Changelog](https://keepachangelog.com);
this is written for users, not git history. Dates are ISO (YYYY-MM-DD).

## [Unreleased]

### Added

- **Cairn Pro (cloud):** optional account with end-to-end-encrypted multi-device sync and a web
  app. Your data is encrypted on your device before it syncs — the server can never read it.
- **Billing:** subscribe to Cairn Pro ($15/mo or $150/yr; India ₹1,299/₹12,990 GST-inclusive)
  via Dodo Payments, with Stripe/Razorpay as regional fallbacks. Cancel any time; cancelling
  never deletes your local data.
- **Security:** breached-password screening at signup and reset (HIBP k-anonymity — your
  password never leaves your device).
- **In-app Help & Legal:** report a bug / send feedback, and reach the privacy policy, terms,
  and status page from Settings.

### Notes

- The **free desktop app remains fully usable offline, forever, with no account.** Cloud sync,
  the web app, and the live pre-trade gate are the paid additions.

## [0.2.0]

### Added

- **Discipline-first trade journaling:** pre-trade rule gate, risk calculator (risk $/% →
  auto lot size), per-account leverage in all P&L, partial closes, optional screenshot
  attachment, two-phase logging (fast gate now, reflection later).
- **Rule engine:** real-time rule checks, hard locks, typed-acknowledgment overrides, daily
  trade limit, max-daily-loss circuit breaker, R-target alerts.
- **Analytics & review:** dashboards, expanded reports, advanced metrics (Sharpe, Sortino,
  max drawdown, expectancy, Kelly, SQN), calendar, notebook, playbooks, weekly-review digest,
  a local heuristic insight engine, per-trade A–F discipline grade, PDF export.
- **Accounts:** per-phase prop-firm accounts; multi-asset (contract-spec / tick-native)
  instruments alongside forex/indices/metals/crypto.
- **Broker capture (read-only, optional):** import MT5 / cTrader / TradingView statements; live
  MT5 read-only detection surfaces mentor-voice discipline warnings. Cairn never places,
  modifies, or closes a broker order.
- **Design:** the Nvexis "The Almanac" visual language — oxblood on parchment, Day + Night.
- **Configurable:** timezone, leverage, risk %, limits, alerts, pairs, keyboard shortcuts.

[Unreleased]: https://github.com/[owner]/cairn/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/[owner]/cairn/releases/tag/v0.2.0
