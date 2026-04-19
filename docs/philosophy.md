> Split from CLAUDE.md — Section 1: FOUNDING DOCUMENT — WHY CAIRN EXISTS

## 1. FOUNDING DOCUMENT — WHY CAIRN EXISTS

### 1.1 The Problem This App Solves

A cairn is a stack of stones placed on a trail to mark the way for those who come after. Each stone is deliberate. Each stone stays where it's placed. A cairn is built by people who have walked the path and want to make sure they — and others — can find it again.

This app exists because someone walked off the path roughly 45-50 times and wants to build the cairn that keeps them on it.

The user who commissioned this app has:
- Studied ICT (Inner Circle Trader) methodology for over a year.
- Attempted roughly 45-50 funded prop-firm challenges.
- Cleared Phase 1 approximately 70% of the time.
- Cleared Phase 2 only 7-10% of the time.
- Diagnosed their own problem as primarily discipline and process, not knowledge.

After structured assessment, the diagnosis was confirmed: **this is ~20% knowledge gap, ~80% discipline and process gap.** The trader knows how to take a good trade. The trader does not yet have the system that prevents them from taking bad ones.

Every feature in this app exists to solve one specific pattern: **"I know the rule. I break the rule. I lose. I promise to follow the rule. I break it again."**

### 1.2 The Design Philosophy

Most trading journals are **records of what you did**. Cairn is a **system that changes what you do**.

This one sentence shapes every decision in this spec. When there is a choice between:
- A nicer report vs. a rule that prevents a bad trade → prevent the bad trade.
- A faster log entry vs. a field that forces self-awareness → force the self-awareness.
- A generic analytic vs. an ICT-specific analytic → go ICT-specific.
- A friendly nudge vs. a hard block when a rule is breaking → hard block.

The app is an **external discipline layer**. The user has proven (45-50 times) that willpower alone does not work during live markets. Cairn replaces willpower with structure.

### 1.3 The Three Jobs Cairn Must Do

1. **Prevent rule violations in real time, before the click.** Not detect them afterwards. Prevent them.
2. **Capture complete, honest data on every trade.** With no escape hatch for laziness or tilt.
3. **Transform that data into insights that change behavior week over week.**

If a feature doesn't serve one of these three jobs, it doesn't belong in v1.

### 1.4 What Cairn Is Not

- Cairn is not a charting tool. The user trades on TradingView and MT5.
- Cairn is not a social platform. There is no sharing, no feeds, no comparisons to other traders.
- Cairn is not a coach. It doesn't give advice during trades. It enforces the user's own pre-committed rules.
- Cairn is not tied to any specific prop firm. It is neutral and configurable.
- Cairn is not cloud-first. It is a private, local, personal tool.

### 1.5 Voice and Tone (For UI Copy)

Cairn speaks the way a respected mentor speaks: direct, calm, and honest. Never cutesy. Never alarmist. Never patronizing. Examples of correct voice:

- ❌ "Oops! Looks like you've hit your daily limit! 🎉"
- ✅ "Daily loss limit reached. Session closed."

- ❌ "Great job on that trade, champion!"
- ✅ "Trade closed. +2.3R. Rules: clean."

- ❌ "Are you sure you want to move your stop loss?"
- ✅ "You are moving SL against you. This violates Rule 4 on this account. Proceed anyway?"
