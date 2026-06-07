# Cairn — Build Prompts

**Companion to:** `CLAUDE.md` (single source of truth) and `docs/roadmap-v1.2.md`.

**Author:** Designed & built by Jai Akash.

---

## 0. HOW TO USE THIS DOCUMENT

This is the **build manual**. CLAUDE.md says *what* to build and *why*. This file says *how* to actually issue prompts to a Claude agent, in order, with the right model, at the right time, so a single solo developer working ~3–4 hours per day on Claude Pro can ship Cairn v1.2 and then v2.0 without burning out the rate limits and without writing slop.

> **Section references:** prompts in this file cite CLAUDE.md by its original numbering. As of 29 May 2026, §15/16/18/19/20 were extracted to `docs/` sub-files — see **§1.5** for the map. Build in **Claude Code (CLI)** — see **§1**.

**The rules (binding, repeated from CLAUDE.md §2.12 and `docs/engineering-quality.md` §19):**
1. **No slop.** Every prompt below ends with the No-Slop Footer (§4). If a prompt doesn't pass §4's gates after the agent finishes, you don't move on — you fix it.
2. **No shortcuts.** TypeScript strict, no `any`, no `// @ts-ignore`, no `eslint-disable` without a linked issue, no floating promises, no `real`/`float` for money or pips. Tests written alongside code, not "later."
3. **No laziness.** Every prompt has a Definition of Done. If even one DoD item is unmet, the prompt isn't done — even if the agent says it is. Trust but verify: run the tests yourself, read the diff yourself, click the screen yourself.
4. **Never assume.** If a prompt's premise contradicts the current state of the repo (e.g. a file the prompt expects to exist isn't there), the agent must STOP and ask. So must you.

**How to read each entry:**

```
### Wave X — Prompt N: <short title>
Model: <Claude model + why>
Estimated agent time: <wall-clock duration the agent will likely take>
Estimated your time: <including review, manual smoke tests, fixes>
Prerequisites: <prompts that MUST be complete first>
Prompt:
  > <copy-paste-ready text to send to the agent>
Definition of done:
  - <verifiable checks>
After this prompt:
  - <housekeeping: commit, push, mark task done>
```

---

## 1. TOOL CHOICE — CLAUDE CODE CLI (DECIDED)

**Decision (29 May 2026): the build happens in Claude Code, the terminal CLI.** Cowork (the desktop chat UI) stays as a side tool for planning and docs. This is settled — the prompts below assume Claude Code.

**Why Claude Code is the right home for this build:**
- It's built for coding workflows. Native git, full bash, real terminal output, IDE integration, and no path-translation layer between you and the files.
- It reads `CLAUDE.md` and the `docs/*.md` sub-files directly, edits in place, and runs `pnpm typecheck` / `pnpm test` / `git diff` in the same loop — stopping only when the Definition of Done is met.
- Same Claude Pro login, but optimised for fewer round-trips per code task, so your token budget goes further on code.
- A 200+ hour build of crypto + sync + billing belongs in a coding tool, not a chat surface.

**Setup (do this once):**
1. Install: `npm install -g @anthropic-ai/claude-code`.
2. Start it inside the project root: `cd C:\Users\jaiak\Desktop\JOR_CLAUDE` then `claude`. It uses your Claude Pro login.
3. First run: let it read `CLAUDE.md`. The large-file warning is resolved — after the 2026-06-03 slimming the root is ~39k chars (down from ~57k) and the heavy specs live in `docs/` (see §1.5 below).
4. Switch model with `/model` (Sonnet 4.6 default; Opus 4.6 for the §2 table; Haiku 4.5 for mechanical work).

**Keep Cowork open in parallel** for: refining a prompt before you paste it into Claude Code; a quick conceptual question; a one-off bash check; editing `CLAUDE.md` or `docs/`. Do the human-review step (read the diff, run the smoke test) wherever you prefer.

All prompts below use paths relative to the project root (`C:\Users\jaiak\Desktop\JOR_CLAUDE\`), which is also Claude Code's working directory.

---

## 1.5 WHERE THE SPECS LIVE — CLAUDE.md RESTRUCTURE (29 May 2026)

`CLAUDE.md` was slimmed to stay under Claude Code's 40k-char performance warning. Large sections were **moved out of the root into `docs/` sub-files**, keeping their original internal numbering. The root now holds a one-line pointer at each old section heading. **A second slimming pass on 2026-06-03 (see note below) cut the root from ~57k → ~39k chars** by extracting the §17.6 progress log and condensing §1 / §17 / §17.5.

**When any prompt below says "Read `CLAUDE.md` §1 (full) / §15 / §16 / §17.6 / §18 / §19 / §20" (or a sub-number like §19.5, §16.a, §18.4, §20.1), read the mapped file instead:**

| Old CLAUDE.md section | Now lives in | Covers |
|---|---|---|
| §1 full founding narrative | `docs/philosophy.md` | Why Cairn exists — problem, design philosophy, three jobs, what-it's-not, voice. (Root §1 keeps the decision-shaping essentials inline: tie-breakers, three jobs, not-list, voice examples.) |
| §15 (and §15.x) | `docs/glossary.md` | ICT/SMC terms + crypto/billing vocabulary |
| §16 (§16.a / §16.b / §16.c) | `docs/end-state.md` | "Done" checklists for v1.1 / v2.0 / v1.2 |
| §17.6 (build/progress log) | `docs/build-status.md` | What's actually built vs planned, per-item commit hashes, five-gate tables, resolved review issues. **Update at the end of every wave.** (Root §17.6 keeps only a current-status headline.) |
| §18 (and §18.x) | `docs/roadmap-v2.0.md` | Eight-stage cloud/sync/billing plan + per-stage prompts |
| §19 (and §19.x) | `docs/engineering-quality.md` | The binding "no slop" engineering standard |
| §20 (and §20.x) | `docs/subscription-contract.md` | EntitlementService / BillingProvider / webhook + state machine |

**Still authoritative in the root `CLAUDE.md` (no remap needed):** §0 (how to use + source-of-truth rules), §2 (core principles), §3 (tech stack & architecture), §4 (nav map), §14 (locked decisions). §1, §17, §17.5 and §17.6 remain in the root as **condensed summaries with pointers** — read them for the headline, follow the pointer for full detail.

> **2026-06-03 slimming note.** §17.6's full per-wave log was extracted to `docs/build-status.md` (registered in the §4 nav map); the root §17.6 now carries only a dated current-status line. §1 was condensed to its decision-shaping essentials with the full narrative pointing to `docs/philosophy.md`. §17 (v1.1 log) and §17.5 (v1.2 log) were compressed to headline lists/tables that defer to `docs/features-v1.md`, `docs/rules-engine.md`, `docs/customization.md`, and `docs/roadmap-v1.2.md`. **When closing out a wave, update `docs/build-status.md` (full entry) AND the §17.6 headline in `CLAUDE.md`.**

The root file's §4 nav map and its pointer lines also link to these files, so "Read CLAUDE.md §19" still resolves — this table just saves Claude Code a hop.

---

## 2. MODEL SELECTION — WHEN TO USE WHICH

Pro plan gives you Sonnet 4.6 generously, Opus 4.6 sparingly (~10–15 prompts per session, tight weekly cap), Haiku 4.5 cheaply. Use this table for **every** prompt:

| Use case | Model | Why |
|---|---|---|
| Cryptography, auth, refresh-token rotation, key wrapping, recovery phrase | **Opus 4.6** | One mistake here = the whole app is broken. |
| Money math (P&L, lot size, leverage, decimals, billing amounts) | **Opus 4.6** | A float bug in P&L is silently wrong forever. |
| Migration writing & migration tests | **Opus 4.6** | Migrations are append-only and live with you forever. |
| Billing webhook handlers, idempotency, state-machine transitions | **Opus 4.6** | Webhook bugs cost real money + trust. |
| Sync engine: vector clocks, conflict resolution, push/pull merge | **Opus 4.6** | Subtle bugs survive every test you didn't think of. |
| Rule-engine changes that affect prevention behaviour | **Opus 4.6** | "Prevention over detection" is the app's reason to exist. |
| Feature work: UI, forms, components, refactors of non-critical code | **Sonnet 4.6** | Strong, fast, generous budget. The default. |
| Analytics queries, charts, dashboards | **Sonnet 4.6** | Logic + UI mix, well within Sonnet's range. |
| Test writing for non-crypto, non-billing code | **Sonnet 4.6** | Sonnet writes good tests fast. |
| Docs, ADRs, plan updates, threat-model drafts | **Sonnet 4.6** | Long-form structured writing. |
| File moves, codemods, mass renames, single-line tweaks | **Haiku 4.5** | Cheap and fast for mechanical work. |
| Reformatting, comment-cleanup, importing one new dep across N files | **Haiku 4.5** | Don't waste Opus or Sonnet budget. |
| **Code review of work done by Sonnet** | **Opus 4.6** | Fresh-context Opus catches what the writing model missed. Required for Stage 18.4–18.8. |

**Rule of thumb:** if you are tempted to use Sonnet on a money/crypto/billing/sync task because "I have Opus budget left for later," **don't**. Spend Opus where it pays for itself.

---

## 3. RATE-LIMIT STRATEGY & FIRST-WEEK SCHEDULE

**Your current state (as you reported, Thursday 28 May 2026, ~16:30 local):**
- Session usage: 46 % (resets in 4 h 4 min, i.e. ~20:35 local)
- Weekly usage: 9 % (resets next Thursday 11:30 local)
- Daily budget: 3–4 hours
- Plan: Claude Pro

**What that buys you per day at 3–4 h:**
- Pro = roughly one full 5-hour rolling session per day, with comfortable headroom.
- That translates to **2–4 prompts per day**, depending on prompt size and how much agent work each one triggers.
- Opus 4.6 is the binding weekly constraint. Reserve it. Use Sonnet 4.6 as the default and switch to Opus only for the table in §2.

**General pacing rules:**
1. **Never start an Opus prompt in the last 25 % of a session window.** Opus prompts often need 2–3 rounds of conversation to land — being mid-prompt when the session resets is wasteful. Start them early.
2. **Sonnet prompts are fine to start any time.** They're usually one-shot or two-shot.
3. **Haiku prompts are free-form.** Sprinkle them in whenever.
4. **One "deep" prompt per session.** A "deep" prompt is anything in Wave 0, Wave 3, or any v2.0 Stage. Don't try to land two of those in the same 5 h window — your own review time is the actual bottleneck, not the rate limit.
5. **Always commit between prompts.** A prompt that landed cleanly should result in a commit before the next prompt starts. If something breaks halfway you can `git reset --hard` to the last green commit.

**Concrete first-week schedule (calibrated to your current usage):**

| When | What | Model | Notes |
|---|---|---|---|
| Today (Thu 28 May), now → 20:30 | **Read § 4 (Quality Gates) and § 5 (Wave 0 overview).** Set up Claude Code in your terminal (if going that route). Do NOT start a code prompt — session is half-spent. | n/a | Prep. Spend the remaining session quota on planning. |
| Tonight (Thu 28 May), 20:35+ (post-reset) | **Wave 0 — Prompt 1:** Commit v1.1 work, green CI. | Sonnet 4.6 | Fresh session window; safe to spend ~60–90 min. |
| Fri 29 May, your block | **Wave 0 — Prompt 2:** Reconcile partial-close tables (the float→integer money fix). | **Opus 4.6** | Money math = Opus. Save Sonnet budget for tomorrow. |
| Sat 30 May, your block | **Wave 0 — Prompt 3:** Build the Review screen (replace the stub). | Sonnet 4.6 | UI + analytics wiring. |
| Sun 31 May, your block | **Wave 0 — Prompt 4:** Smoke E2E + cleanup. | Sonnet 4.6 | Closes out Wave 0. |
| Mon 1 Jun → Fri 5 Jun | **Wave 1 — Prompts 1–6** (one per day, ~50 min agent + ~30 min review). | Sonnet 4.6 (all six) | Friction quick-wins are perfect for Sonnet. |
| Sat 6 Jun | Buffer / catch-up / review. | n/a | Build a habit of one rest day per week. |

After this first week you'll have a feel for prompt cadence. The full multi-month timeline is in §17.

**If you blow through Sonnet faster than expected:** drop to one prompt/day and use the remaining time for manual smoke testing and reading the diff. Manual review is the highest-leverage non-Claude activity.

**If you blow through Opus weekly cap:** wait until Thursday 11:30 reset before starting the next Opus-tagged prompt. Do NOT downgrade an Opus prompt to Sonnet to save budget — that's exactly the trade-off that produces slop. Wait, or do a non-Opus task instead.

---

## 4. QUALITY GATES — MUST PASS BETWEEN EVERY PROMPT

These are pasted at the bottom of every prompt as the **No-Slop Footer**. They're also what *you* check after the agent says it's done. If even one fails, the prompt is not done.

```
NO-SLOP FOOTER (binding for every prompt):

1. TYPES & LINT
   - pnpm typecheck passes with zero errors.
   - pnpm lint --max-warnings 0 passes with zero warnings.
   - No new `any`. No new `// @ts-ignore` (only `// @ts-expect-error: <reason> — issue #N` with an actual issue).
   - No new `eslint-disable` without an inline reason comment.
   - No `console.log` in production code paths.

2. TESTS
   - pnpm test passes with zero failures.
   - Coverage on touched files is >= prior coverage. Never down.
   - Every new public function has at least one test.
   - Crypto / P&L / billing / sync / rule-engine changes have at least one fast-check property test.

3. DATA & MONEY
   - No new column stores money or pips as `real` / `float`. Integer-encoded only.
   - No new use of JS `number` for currency or pip math. decimal.js or big.js only.
   - No new migration edits a previously-committed migration. Append-only.
   - Every new migration has a forward-and-backward test on a seeded DB.

4. BOUNDARIES
   - Every new IPC handler has a Zod input schema and a typed Result<T> return.
   - Every new HTTP route (v2.0) has a Zod input schema, a typed Result<T> return, and is registered in the handler map.
   - No raw throws across IPC or HTTP boundaries. Map to typed error codes.

5. SECRETS & LOGS
   - No secrets in source or commits. `gitleaks` clean.
   - No PII (password, token, ciphertext, full email, full Authorization header) in logs.

6. DOCS
   - If this prompt added a feature, the relevant doc in `docs/*.md` has a v1.2 Additions or v2.0 Additions section appended.
   - If this prompt added an architectural decision, an ADR file is added under `docs/adr/`.

7. MANUAL SMOKE
   - The human (Akash) has run the touched feature end-to-end at least once and confirmed it does what the spec says.
   - If a rule was added or changed, the human has confirmed it BLOCKS in the real UI, not just in tests.

If any item above is unmet, the prompt is NOT done. Stop, fix, re-run. Time pressure does not lower this bar.
```

**You are also expected to:**
- After every prompt: `git status`, read the diff (`git diff --stat`, then `git diff`), commit with a Conventional Commit message.
- After every wave or stage: run the full E2E (`pnpm test:e2e`) and a manual click-through of the affected flows.

---


## 5. v1.2 — WAVE 0: FOUNDATION

**Wave goal:** make the existing v1.1 work commit-clean, replace the Review-screen stub with real content, fix the two partial-close tables (the float-money sin), and add the smoke E2E. This wave unblocks every subsequent wave.

**Wave duration estimate at 3–4 h/day:** 4 working days.

### Wave 0 — Prompt 1: Commit v1.1 work, green CI

**Model:** Sonnet 4.6 (audit + commit + CI is mostly mechanical).
**Estimated agent time:** 45–75 min.
**Estimated your time:** +30 min for diff review.
**Prerequisites:** none.

**Prompt:**
> Read `CLAUDE.md` (the whole file) and `docs/roadmap-v1.2.md` (§6 end-state list, items 1 + 25). Then survey the working tree. Today's job is Wave 0 Prompt 1: commit the uncommitted v1.1 work and get CI green.
>
> Steps you MUST perform, in order:
>
> 1. Run `git status --short` and `git diff --stat`. Report what's uncommitted.
> 2. Run `pnpm install` to make sure deps are coherent.
> 3. Run `pnpm typecheck` and report any errors. Fix them. Do not silence them with `any` or `// @ts-ignore`.
> 4. Run `pnpm lint --max-warnings 0` and fix all warnings honestly. No `eslint-disable` to suppress.
> 5. Run `pnpm test` and triage any failures. If a test is wrong, fix the test (with a comment explaining the fix). If the code is wrong, fix the code. Do not skip or `.todo` any test.
> 6. Stage and commit in logically grouped commits, using Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:` — never `wip` or `misc`). Each commit must compile and pass tests on its own.
> 7. Open a TodoWrite list before you start; tick items off as you go.
>
> After the work: produce a one-paragraph report of (a) what was uncommitted, (b) how many commits you made, (c) what's still red, if anything.
>
> NO-SLOP FOOTER applies. (Sections 1, 2, 6, 7 are the relevant ones here.)

**Definition of done:**
- `git status` is clean on `main` (or on the v1.1 branch — whichever Akash chooses to land on).
- `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm test` all green.
- Conventional Commits used.
- TodoWrite list shows every step ticked.

**After this prompt:** push to origin. Open `docs/roadmap-v1.2.md`, check item 1 of §6. Move on.

---
DONE
### Wave 0 — Prompt 2: Reconcile partial-close tables (money-integrity fix)

**Model:** **Opus 4.6.** Money math + schema change + migration = the Opus tax is worth it.
**Estimated agent time:** 90–120 min.
**Estimated your time:** +45 min for review and a manual partial-close in the UI.
**Prerequisites:** Wave 0 Prompt 1 committed.

**Prompt:**
> Read `CLAUDE.md` §2.5 and §19.5 (money must be integer-encoded / decimal.js, never `real`/`float`), §19.6 (migration rules), and `docs/roadmap-v1.2.md` §6 item 3.
>
> Investigation first, code second:
>
> 1. Find both partial-close tables in `electron/db/schema.ts`. The roadmap says `trade_partials` is integer-encoded and `partial_closes` is float. Confirm this. Report column-by-column what each one stores and which one(s) the IPC handlers and analytics services actually read from.
> 2. Identify every place in `electron/ipc/*.ts`, `electron/services/**`, and `src/features/**` that touches either table. List them.
>
> Migration plan (write this as a comment block in the new migration file before any SQL):
>
> 1. Decide canonical name: `trade_partials` (integer-encoded, since money/pips must be integer).
> 2. Create a new migration that:
>    - Copies any data from `partial_closes` into `trade_partials`, converting floats to integer cents/pips using a clearly documented multiplier (probably the same multiplier already used by `trade_partials`). If the float values were stored in dollars, the conversion is `round(value * 100)` for USD-pricing instruments; if pips, `round(value * 10000)` for 4-digit pairs or `round(value * 100)` for JPY pairs. Use the same conversion utilities the rest of the codebase already uses — do not invent new ones.
>    - Drops `partial_closes` AFTER copy is verified by a row-count assertion in the migration.
> 3. Backfill is tested forward + backward on a seeded DB.
>
> Code change:
>
> 1. Update every read/write site to use `trade_partials` only. Remove all references to `partial_closes`.
> 2. Update the Drizzle schema in `electron/db/schema.ts`.
> 3. Update or add tests: a migration test in `tests/integration/migrations.test.ts` that runs forward on a seeded DB with mixed real/integer data and asserts the rows match cent-for-cent / pip-for-pip; a fast-check property test for the conversion utility if you wrote one.
> 4. Update `docs/data-model.md` v1.1 Additions to mention this consolidation.
>
> Critical: this is a one-shot conversion. If the data already in `partial_closes` is sometimes in dollars and sometimes in pips depending on instrument, that ambiguity is itself a bug — investigate, document, and ask Akash before destroying data. If you are unsure, STOP and ask.
>
> NO-SLOP FOOTER applies. Money rules (§3) are the binding ones.

**Definition of done:**
- Schema has one partial-close table (`trade_partials`), all columns integer.
- New migration committed, with forward + backward test passing.
- All references to `partial_closes` removed across `electron/`, `src/`, and tests.
- A fast-check property test exists for the float→integer conversion utility (if you needed to write one).
- `docs/data-model.md` updated.
- Manual smoke test: open the app, place a trade, do a partial close, verify the partial appears with correct integer values in the DB (`sqlite3 <db> "select * from trade_partials"`).

**After this prompt:** push. Check item 3 of `docs/roadmap-v1.2.md` §6.
DONE
---

### Wave 0 — Prompt 3: Build the Review screen

**Model:** Sonnet 4.6.
**Estimated agent time:** 90–150 min.
**Estimated your time:** +45 min UI review.
**Prerequisites:** Wave 0 Prompts 1 + 2 committed.

**Prompt:**
> Read `CLAUDE.md` §1, `docs/features-v1.md` (Review section if present), and `docs/roadmap-v1.2.md` §6 item 2.
>
> The Review screen is currently a stub. It is the home for: (a) the v1.2 Wave 2 local insight engine, (b) the v1.2 Wave 3 deferred-reflection queue. Build the shell now so Wave 2 and Wave 3 can drop content into it.
>
> Required content for this prompt (shell, not yet populated):
>
> 1. **Header:** date range picker (default: last 30 days), account selector (defaults to active account), an Export PDF button (wire to the existing PDF export service).
> 2. **Section: "Trades awaiting reflection"** — empty state for now ("No trades awaiting reflection — you're caught up"). Just the section frame; population is Wave 3.
> 3. **Section: "Insights"** — empty state for now ("No insights yet. Cairn needs at least 20 closed trades to start surfacing patterns."). Just the frame; population is Wave 2.
> 4. **Section: "Period summary"** — populate this immediately. Show: closed trades, win-rate, expectancy in R, gross P&L, clean-trade %, current win/loss streak. Pull from existing analytics services in `electron/services/analytics/`. If a needed metric isn't there yet, use what exists and TodoWrite a follow-up — do not invent or stub.
> 5. **Section: "Recent reviews"** — list the existing `reviews` table rows for the period, with a click-through to a detail panel. The `reviews.ts` analytics service already exists; use it.
>
> Visual standards: glassmorphism per `docs/design-system.md`, Framer Motion fade-in on section mount, JetBrains Mono for numbers, Inter for everything else, all numbers right-aligned in tables.
>
> Wire the route in `src/router.tsx` (or wherever routes are defined — check, don't assume), and add a sidebar nav item if not already present. Make sure the sidebar attribution "Designed & built by Jai Akash" remains at bottom-left.
>
> Tests: a render test for the empty states; a render test with seeded data confirming the period summary populates correctly.
>
> NO-SLOP FOOTER applies.

**Definition of done:**
- `/review` (or the configured route) renders the four sections above.
- Period summary populates from real data when trades exist in the chosen window.
- Empty states copy is exactly the strings above (calm, no exclamation marks — match the spec voice).
- Sidebar nav item exists and is selected when on the route.
- Render tests pass.

**After this prompt:** push. Check item 2 of `docs/roadmap-v1.2.md` §6.
DONE
---

### Wave 0 — Prompt 4: Smoke E2E + housekeeping

**Model:** Sonnet 4.6.
**Estimated agent time:** 60–90 min.
**Estimated your time:** +20 min.
**Prerequisites:** Wave 0 Prompts 1, 2, 3 committed.

**Prompt:**
> Read `docs/testing.md` and `docs/roadmap-v1.2.md` §6 item 4. Today's job: write the smoke E2E, remove the stub `export-service.ts`, and close out Wave 0.
>
> Tasks:
>
> 1. **Smoke E2E:** in `tests/e2e/`, add a single Playwright test (`smoke.spec.ts`) that walks: launch app → complete onboarding → log a session bias → place a market trade → close the trade → land on Analytics and confirm the trade appears. Use a fresh temp DB per run. The test should fail loudly if any step blocks. Include a recorded video on failure (Playwright supports this; turn it on in config).
> 2. **Remove the stub:** delete `electron/services/export-service.ts` (the actual export logic lives in `electron/ipc/data.ts` per the roadmap). Update any imports.
> 3. **CI step:** if `.github/workflows/` exists, add the smoke E2E to the CI matrix. If not, TodoWrite a follow-up to add it in Stage 0 of v2.0.
> 4. **Tick Wave 0 items in the roadmap:** edit `docs/roadmap-v1.2.md` § 6 items 1, 2, 3, 4 to indicate completion. Add a `v1.2 Wave 0 — DONE on <date>` line at the top of §6.
>
> NO-SLOP FOOTER applies. The smoke E2E is itself a quality gate for every subsequent wave — do not let it be flaky.

**Definition of done:**
- `pnpm test:e2e` runs and the smoke test passes locally.
- `electron/services/export-service.ts` is gone; no broken imports.
- Roadmap doc shows Wave 0 done.

**After this prompt:** push. Wave 0 is **complete**. Take a break before Wave 1; resist the urge to start immediately.

---

## 6. v1.2 — WAVE 1: FRICTION QUICK-WINS

**Wave goal:** kill the bad friction in the New Trade panel and Close Trade modal without weakening any discipline gate. Six features, each independently shippable, each Sonnet-friendly.

**Wave duration estimate at 3–4 h/day:** ~10 working days (one prompt per day with review time).

### Wave 1 — Prompt 1: Remember last trade context

**Model:** Sonnet 4.6.
**Estimated agent time:** 45–60 min. **Your time:** +20 min.
**Prerequisites:** Wave 0 done.

**Prompt:**
> Read `docs/features-v1.md` (New Trade panel section), `docs/roadmap-v1.2.md` §4 Wave 1 item 1 and §6 item 5.
>
> Implement "remember last trade context" in the New Trade panel:
>
> - Add a Zustand slice (or extend an existing session store) in `src/stores/` called `last-trade-context` that holds `{ pair, setup, mode, accountId, timestamp }`.
> - It is **session-scoped**, NOT persisted to disk. Clearing the session (close + reopen the app) resets it. Document this in the slice's JSDoc.
> - When the New Trade panel mounts, pre-fill pair/setup/mode from the slice if `timestamp` is within the last 6 hours.
> - When a trade is submitted (placed, not draft), update the slice with the chosen pair/setup/mode.
> - Add a small "(from last trade)" caption under the pre-filled fields so the trader can see what was inherited. Caption disappears on first edit.
> - Add a "Clear" button next to the caption that resets to the account default in one tap.
>
> Honesty check: this prompt must NOT pre-fill emotional state, urgency, or any field that requires real-time self-awareness. Only pair / setup / mode / account.
>
> Tests: a render test confirming pre-fill happens within the window and not outside it; a test confirming Clear works; a test confirming the slice is not persisted (mount, set, unmount, remount → empty).
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 5 of the roadmap is met; manual: place a trade, close the panel, reopen → pair/setup/mode are pre-filled with caption.
DONE
---

### Wave 1 — Prompt 2: Invalidation quick-chips

**Model:** Sonnet 4.6.
**Estimated agent time:** 45–60 min. **Your time:** +20 min.
**Prerequisites:** Wave 1 Prompt 1.

**Prompt:**
> Read `docs/features-v1.md`, `docs/roadmap-v1.2.md` Wave 1 item 2 and §6 item 6, and `CLAUDE.md` §2.3 (honesty forcing functions).
>
> The invalidation field currently requires ≥ 20 characters of free text. This is honest but slow. Add **ICT-native quick-chips** that satisfy the 20-char requirement in one tap, without removing the free-text path.
>
> Chip set (use exactly these eight, plus a "Custom…" option that reveals the free-text field):
>
> 1. "Below the OB I'm entering at"
> 2. "Liquidity sweep fails to reverse"
> 3. "Closes back inside the FVG"
> 4. "MSS in opposing direction"
> 5. "DXY contradicts the bias"
> 6. "Price reclaims the broken structure"
> 7. "Killzone ends without entry"
> 8. "Volume dries up before entry"
>
> Behaviour:
> - Tapping a chip fills the invalidation field with the chip text and marks the field valid.
> - Tapping a second chip replaces the previous one (single-select, never concatenated — that would be cheating).
> - Free-text editing of the filled value is allowed; once edited, the chip selection is cleared.
> - "Custom…" reveals the free-text field with the existing 20-char minimum.
>
> Honesty check: the chip text MUST be at least 20 characters (all the above are). Verify in a test.
>
> Store chips in `src/features/pre-trade/constants/invalidation-chips.ts` so they're easy to extend later without touching component code.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 6 met; chips render; tap fills field and validates; free-text path still works; tests cover both paths.

---

### Wave 1 — Prompt 3: One-tap emotional state

**Model:** Sonnet 4.6.
**Estimated agent time:** 60 min. **Your time:** +20 min.
**Prerequisites:** Wave 1 Prompt 2.

**Prompt:**
> Read `docs/features-v1.md`, `docs/roadmap-v1.2.md` Wave 1 item 3 and §6 item 7.
>
> Replace the three sliders (focus / discipline / urgency? — confirm from the schema and current UI) with a single one-tap selector by default, with the sliders behind an "Advanced" disclosure.
>
> Selector: three buttons — **Focused / Neutral / Tilted**. Mapping (store these in `src/features/pre-trade/constants/emotion-presets.ts`):
>
> - Focused → focus 8, discipline 8, urgency 3
> - Neutral → focus 6, discipline 6, urgency 5
> - Tilted → focus 4, discipline 4, urgency 8 + the rule engine should flag this in the existing pre-trade evaluation
>
> Below the three buttons, a small "Advanced (set scores manually)" disclosure reveals the three sliders. If the trader uses the sliders, the corresponding button highlights or de-highlights — they're two views of the same data.
>
> The schema does NOT change — the three numeric columns stay. Only the UI changes.
>
> Tests: tap each preset, assert the three numbers match the constants; open advanced, drag a slider, assert preset highlight clears.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 7 met; one-tap default works; advanced disclosure available; schema unchanged.

---

### Wave 1 — Prompt 4: "Closed clean at TP/SL" one-click close

**Model:** Sonnet 4.6.
**Estimated agent time:** 75 min. **Your time:** +30 min.
**Prerequisites:** Wave 1 Prompt 3.

**Prompt:**
> Read `docs/features-v1.md` Close Trade modal section, `docs/roadmap-v1.2.md` Wave 1 item 4 and §6 item 8, and `CLAUDE.md` §1.3 (honesty over speed for trades that deviated).
>
> Add a one-click "Closed clean at TP" and "Closed clean at SL" button at the top of the Close Trade modal. Behaviour:
>
> - Clicking "Closed clean at TP" pre-fills: exit price = TP, exit time = now, honesty Y/N = clean (plan followed), rules-broken checklist = empty, reflection = "Closed clean at TP, plan followed".
> - Clicking "Closed clean at SL" pre-fills: exit price = SL, exit time = now, honesty Y/N = clean (plan followed, accepted the SL), rules-broken checklist = empty, reflection = "Closed clean at SL, plan followed".
> - In BOTH cases, the trader must still click Submit; the prompt does NOT auto-submit. Honesty is preserved by the conscious final click.
> - If the rule engine has flagged any violation during the trade life (e.g. SL was moved against), the "Closed clean" buttons are **disabled** with a tooltip: "This trade has at least one flagged action; close manually."
>
> Tests: TP/SL prefill correctly; submit is still required; disabled-when-flagged works.
>
> NO-SLOP FOOTER applies. Critical: do NOT auto-close or skip the rules-broken checklist programmatically for any trade with engine-flagged actions. That would weaponise speed against discipline.

**Definition of done:** §6 item 8 met; one-click path exists; disabled-when-dirty works; manual smoke confirms.

---

### Wave 1 — Prompt 5: Command palette (⌘K)

**Model:** Sonnet 4.6.
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 1 Prompt 4.

**Prompt:**
> Read `docs/features-v1.md` TopBar section, `docs/roadmap-v1.2.md` Wave 1 item 5 and §6 item 9, and `docs/customization.md` v1.1 keyboard-shortcuts.
>
> Implement a real ⌘K / Ctrl+K command palette to replace the existing TopBar "coming soon" slot.
>
> Commands (initial set — extensible via a registry in `src/features/command-palette/registry.ts`):
>
> - "New trade" → navigate to /new-trade
> - "Close trade" → open the active-trade close modal (if there's an open trade; otherwise toast "No open trades")
> - "Log session bias" → navigate to /bias
> - "Jump to account: <name>" → one entry per account
> - "Settings: <tab>" → one entry per settings tab
> - "Toggle theme"
> - "Export trade review PDF"
> - "Show keyboard shortcuts"
>
> UI: shadcn `<Command>` primitive with fuzzy search, frosted-glass surface, JetBrains Mono for the command keys, Inter for descriptions. Focus trap when open. Esc closes.
>
> Wire ⌘K / Ctrl+K globally (NOT inside any input — never override the user's typing). Document the shortcut in Settings → Shortcuts.
>
> Tests: keyboard open/close; each command in the registry resolves to the expected route or action.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 9 met; ⌘K opens, fuzzy search works, every command executes; documented in Settings.

---

### Wave 1 — Prompt 6: Calendar view

**Model:** Sonnet 4.6.
**Estimated agent time:** 90–120 min. **Your time:** +30 min.
**Prerequisites:** Wave 1 Prompt 5.

**Prompt:**
> Read `docs/analytics.md` and `docs/roadmap-v1.2.md` Wave 1 item 6 and §6 item 10.
>
> Add a Calendar view as a new tab inside Analytics (and a Dashboard widget linking to it).
>
> Layout: month grid (Mon–Sun rows, weeks as rows). Each cell shows the date and a P&L-coloured background (positive = the existing green scale, negative = the existing red scale, flat = neutral). Cells with zero trades have no colour. Hover shows: trades, win-rate, gross P&L for the day. Click-through navigates to `/trades?date=YYYY-MM-DD` filtered.
>
> Use existing analytics services (`electron/services/analytics/performance.ts` or equivalent) to fetch the per-day rollup. If a daily-rollup query doesn't exist, add ONE — and add a unit test for it. Do not duplicate per-day math at the UI layer.
>
> Tests: render test with a seeded month; click-through navigates correctly; the rollup query has a unit test.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 10 met; calendar renders; click-through works; rollup query unit-tested.

**After Wave 1:** push, take a half day off, manually click through every flow you just touched. **Do NOT start Wave 2 until the Wave 1.5 remediation below is green.**

---

## 6.5 v1.2 — WAVE 1.5: REMEDIATION (run before Wave 2)

**Why this exists:** the 2026-05-30 review (recorded in `CLAUDE.md` §17.6) confirmed all six Wave 1 features are implemented and wired, but found two real calendar bugs, two floating promises, a drift-prone test, and — critically — that the five quality gates were never run this cycle. Wave 1 is **functionally complete but not "done" by the §19 no-slop bar.** This wave closes that gap. It is local-only and zero-cost.

**Wave goal:** fix every issue logged in `CLAUDE.md` §17.6, get all five gates green, commit, then Wave 2 is unblocked.

**Wave duration estimate at 3–4 h/day:** 1 working day.

### Wave 1.5 — Prompt 1: Fix the calendar timezone + bucketing bugs

**Model:** Opus 4.6 (date/time + per-day correctness — same class as money math).
**Estimated agent time:** 60 min. **Your time:** +30 min.
**Prerequisites:** Wave 1 committed.

**Prompt:**
> Read `CLAUDE.md` §17.6 (issues 1 and 2), `docs/customization.md` v1.1 (timezone, default America/New_York), and `docs/rules-engine.md` v1.1 (how daily-trade-limit and max-daily-loss bucket "day"). Then fix `getDailyHeatmap` in `electron/services/analytics/performance.ts`:
>
> 1. **Timezone bug:** the query buckets days with `strftime('%Y-%m-%d', updated_at/1000, 'unixepoch')` — that's UTC. Bucket by the user's **configured timezone** instead, the SAME way the per-day rules engine buckets a day. Do not invent a second definition of "day" — find the one the rules engine already uses and reuse it. If that logic isn't shared, extract it to one helper and call it from both places.
> 2. **Wrong-column bug:** closed trades are bucketed by `updated_at`, which moves whenever a trade is later edited. Bucket closed trades by `exit_time` (the column exists). Decide and document how open/draft trades (null `exit_time`) are handled — they should not appear as phantom days.
> 3. Update the existing rollup unit test to cover: (a) a trade whose `exit_time` is near local midnight lands on the correct local day, NOT the UTC day; (b) editing a closed trade (bumping `updated_at`) does not move its calendar cell; (c) the calendar day for a trade matches the day the rules engine assigns it.
>
> NO-SLOP FOOTER applies. This is correctness-critical: a calendar that disagrees with the rules engine erodes trust in both.

**Definition of done:** §17.6 issues 1 + 2 resolved; calendar day == rules-engine day in tests; rollup test covers timezone + edit-stability + exit_time bucketing.

---

### Wave 1.5 — Prompt 2: Kill the floating promises + de-drift the clean-close test

**Model:** Sonnet 4.6.
**Estimated agent time:** 45 min. **Your time:** +20 min.
**Prerequisites:** Wave 1.5 Prompt 1.

**Prompt:**
> Read `CLAUDE.md` §17.6 (issues 3, 4, 5, 6) and §2.12 / §19 (no floating promises, every async path awaited or explicitly void-ed with rejection handled).
>
> 1. **Floating promises (issue 3):** in `src/features/command-palette/CommandPalette.tsx` (~L50, `ipc.accounts.list().then(...)`) and `src/features/post-trade/CloseTradeModal.tsx` (~L267, `Promise.all([...]).then(...)`), handle rejection — `void`-prefix AND add a `.catch` that surfaces the error (toast or logged), or convert to `await` inside a guarded async effect. No naked floating promise may remain.
> 2. **Test drift (issue 4):** `tests/unit/post-trade/close-clean-prefill.test.ts` re-implements `applyCleanClose` and `dbToDisplayPrice` inline. Extract the real prefill logic from `CloseTradeModal.tsx` into a pure module `src/features/post-trade/clean-close-prefill.ts` (exporting `buildCleanClosePrefill` and the price helper), have the component import and use it, and rewrite the test to import from that module so it can never drift from the component again.
> 3. **Minor (issues 5, 6):** reconcile the `last-trade-context.ts` JSDoc with actual behaviour (placed-only, not drafts). Remove the one duplicated import line in `tests/unit/analytics/adherence.test.ts` and `tests/unit/analytics/performance.test.ts`. Leave `matchCommand` as-is (shadcn `<Command>` provides fuzzy filtering) but add a one-line comment noting why substring is acceptable.
>
> NO-SLOP FOOTER applies.

**Definition of done:** zero floating promises in the Wave 1 files; clean-close logic lives in one pure module imported by both component and test; minor items cleared.

---

### Wave 1.5 — Prompt 3: Run all five gates green, then close out

**Model:** Sonnet 4.6.
**Estimated agent time:** 45 min. **Your time:** +30 min (you run the gates locally).
**Prerequisites:** Wave 1.5 Prompts 1 + 2.

**Prompt:**
> Read `CLAUDE.md` §17.6 ("Verification NOT run" + "Wave 2 readiness verdict") and `docs/testing.md`.
>
> The five quality gates were never executed this cycle because the review ran in a sandbox that couldn't resolve the Windows-symlinked `node_modules`. They MUST be run locally now and all pass:
>
> 1. `pnpm typecheck`
> 2. `pnpm lint` (max-warnings 0)
> 3. `pnpm test:unit`
> 4. `pnpm build`
> 5. `pnpm test:e2e` (smoke)
>
> Fix whatever they surface. Do not weaken a gate to make it pass (no `--max-warnings` bump, no skipped tests, no `@ts-ignore`). If the smoke E2E is flaky, fix the flake — it gates every subsequent wave.
>
> When all five are green: update `CLAUDE.md` §17.6 — move issues 1–6 from "to fix" into a "Resolved" subsection with the fixing commit hashes, change the "Verification NOT run" block to record the date the gates passed, and change the Wave 2 readiness verdict to "Wave 1 DONE — gates green on <date>, Wave 2 unblocked." Tick the relevant §6 end-state items in `docs/roadmap-v1.2.md`.
>
> NO-SLOP FOOTER applies.

**Definition of done:** all five gates green locally; §17.6 updated to "Wave 1 DONE"; roadmap items ticked; committed and pushed.

**Repo hygiene note (one-time, do this first if `git status` errors):** the `.git/index` was corrupted during the 2026-05-30 review (a Windows-mount permissions quirk). History and objects are intact. To rebuild the index: in the project folder run `del .git\index` (PowerShell: `Remove-Item .git\index*`), delete any `.git\index.lock` / `.git\index.stash.*`, then `git reset`. Also confirm the 12 previously-corrupted working-tree files are at their committed content before starting.

**After Wave 1.5:** Wave 1 is genuinely done. Now start Wave 2.

---

## 7. v1.2 — WAVE 2: AUTOMATIONS

**Wave goal:** turn on the local intelligence. Auto-refresh, derived analytics, the local insight engine, auto-detection of rules broken at close, composite score, A–F grades, Notebook. All local heuristics, no network.

**Wave duration estimate at 3–4 h/day:** ~14 working days (some prompts span 2 sessions).

### Wave 2 — Prompt 1: Auto dashboard refresh + event bus

**Model:** Sonnet 4.6.
**Estimated agent time:** 60 min. **Your time:** +20 min.
**Prerequisites:** Wave 1 done.

**Prompt:**
> Read `docs/features-v1.md` Dashboard, `docs/roadmap-v1.2.md` Wave 2 item 1 and §6 item 11.
>
> Bake the existing v1.1 dashboard-refresh fix into a single event flow so we never regress.
>
> 1. Add `src/lib/event-bus.ts` — a tiny typed event emitter (NOT a global window-attached one; export a singleton from this module). Events: `trade.placed`, `trade.closed`, `trade.partial-closed`, `session.locked`, `session.unlocked`, `rule.violated`.
> 2. Every IPC handler that mutates trade state in `electron/ipc/trades.ts` must emit the corresponding event AFTER the DB write commits.
> 3. The renderer subscribes via preload-exposed `cairn.events.on(name, cb)` (extend `electron/preload.ts`).
> 4. The Dashboard, the sidebar streak, and the Discipline Ring all subscribe to the relevant events and re-query their slice of state. No more setInterval polling.
> 5. Add a test (`tests/integration/event-bus.test.ts`) that places a trade via the IPC and asserts the event fires with the expected payload shape.
>
> Do NOT remove existing manual-refresh affordances if they exist; just make them no-ops on the happy path.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 11 met; place a trade, dashboard updates without manual refresh; event-bus test passes.

---

### Wave 2 — Prompt 2: Derived analytics (TOD, DOW, expectancy, profit factor, R-distribution)

**Model:** Sonnet 4.6, escalate to **Opus 4.6** for the expectancy + profit-factor math (one Opus session inside this prompt).
**Estimated agent time:** 120 min. **Your time:** +30 min.
**Prerequisites:** Wave 2 Prompt 1.

**Prompt:**
> Read `docs/analytics.md`, `docs/roadmap-v1.2.md` Wave 2 item 2 and §6 item 12.
>
> Add five new analytics queries + their UI in the Analytics module:
>
> 1. **Time-of-day P&L heatmap** — 24 buckets × day-of-week, coloured by expectancy in R.
> 2. **Day-of-week summary** — bar chart, P&L and win-rate per weekday.
> 3. **Expectancy in R** — single big number with trend sparkline; formula = `mean(R outcome over closed trades)`. Use decimal.js for the average. Add a fast-check property test that asserts: if all R outcomes equal `x`, expectancy equals `x` regardless of count.
> 4. **Profit factor** — `gross_winners_in_R / gross_losers_abs_in_R`. If `gross_losers_abs_in_R` is zero, display `∞` and a tooltip explaining. Property test: scale-invariant (multiply all R by k → profit factor unchanged).
> 5. **R-multiple distribution** — histogram of R outcomes, bucketed at 0.5R. Vertical line at 0.
>
> All queries live in `electron/services/analytics/` as pure functions taking a trade list and returning typed objects. UI components in `src/features/analytics/tabs/`.
>
> The expectancy + profit-factor math must use decimal.js. NO `number` for these. Tests use fast-check.
>
> NO-SLOP FOOTER applies, especially money/decimal rules.

**Definition of done:** §6 item 12 met; five charts render; property tests pass; decimals throughout.

---

### Wave 2 — Prompt 3: Local insight engine — the five heuristics

**Model:** Sonnet 4.6.
**Estimated agent time:** 120–180 min, possibly across two sessions. **Your time:** +60 min for tuning thresholds against your own seeded data.
**Prerequisites:** Wave 2 Prompt 2.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 2 item 3 and §6 item 13. Read `CLAUDE.md` §1.3 (the third job is "transform data into insights that change behavior"). Critical: this is a **local statistical engine**, NOT an LLM call. No network. No paid model. No "AI" in the UI label — call it "Patterns" or "Cairn observed."
>
> Implement at least these five heuristics in `electron/services/insights/`:
>
> 1. **Urgency hurts win-rate.** Compute win-rate for `urgency <= 5` vs `urgency >= 7`. Surface only if the delta is > 10 pp AND each bucket has >= 10 trades. Copy: "Your win-rate is X% when urgency ≤ 5, but Y% when urgency ≥ 7. (N₁/N₂ trades each.)"
> 2. **Outside-killzone expectancy.** Compute expectancy in R for trades inside vs outside listed killzones. Surface if outside-killzone expectancy is negative AND >= 10 outside-killzone trades exist.
> 3. **Tilt cycle.** Detect sequences of (loss, loss, loss, trade with risk_pct > account.default_risk_pct * 1.5). Count occurrences in last 30 / 60 / 90 days. Surface if >= 2 occurrences in last 30.
> 4. **Best setup, under-used.** Find the setup with the highest expectancy in R among setups with >= 10 trades. If trader's frequency of that setup is < 20% of total trades, surface: "Setup X is your highest-expectancy setup (+R per trade) but you take it only N% of the time."
> 5. **Worst hour.** Find the worst-expectancy hour-of-day among hours with >= 5 trades. Surface if expectancy is negative.
>
> Each heuristic is a pure function `(trades: ClosedTrade[]) => Insight | null`. They live in `electron/services/insights/<heuristic-name>.ts` with one fast-check property test each (e.g. "if no trades have urgency >= 7, heuristic 1 returns null").
>
> The Review screen's "Insights" section (built in Wave 0 Prompt 3) now lists the non-null returns, sorted by `severity` (which each heuristic computes). Each insight has a "Dismiss for 7 days" action that persists in a `dismissed_insights` table — add the migration.
>
> Tests: each heuristic has unit tests + property test; the Review screen renders the list when seeded.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 13 met; ≥ 5 heuristics wired; tests pass; manual: seed 50 trades into a dev DB, open Review, see insights appear with sensible copy.

---

### Wave 2 — Prompt 4: Auto-detect rules broken at close

**Model:** **Opus 4.6.** Rule-engine surface — get this wrong and it lies.
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 2 Prompt 3.

**Prompt:**
> Read `docs/rules-engine.md` and `docs/roadmap-v1.2.md` Wave 2 item 4 and §6 item 14.
>
> When opening the Close Trade modal, compute a planned-vs-actual diff for the active trade and **pre-tick** the rules-broken checklist with detected violations. The trader confirms or unticks each one. Honesty is preserved because the trader still makes the final call; recall friction is eliminated because the trader doesn't have to remember every rule.
>
> Detections to implement (extend the existing rule engine — do NOT bolt this on outside it):
>
> 1. **SL widened** — `current_sl` is further from entry than `planned_sl` was.
> 2. **TP narrowed** — `current_tp` is closer to entry than `planned_tp` was.
> 3. **Risk increased mid-trade** — current risk_$ exceeds planned by > 10%.
> 4. **Traded outside listed killzones** — entry timestamp is not inside any killzone for the account.
> 5. **Daily trade limit exceeded** — this is the Nth+1 trade today where N is the account limit.
> 6. **Max daily loss circuit breaker was tripped earlier this session and you still traded** — rare but check.
>
> Wire the detections into the existing rule engine as evaluators that return a list of violation codes. The Close Trade modal's checklist pre-ticks the matching items by code, with a small "✓ detected by Cairn" badge next to each pre-ticked item.
>
> Tests: a vitest suite per detector, plus an integration test that seeds a trade-with-widened-SL and asserts the modal pre-ticks the right item.
>
> NO-SLOP FOOTER applies, especially: prevention over detection is the app's north-star (§14 #14), so each of these detectors should ALSO have a real-time hook in the rule engine where applicable (e.g. SL widening flagged the moment it happens). Add the real-time hook for SL widening as part of this prompt; the others can be TodoWrite'd if not already present.

**Definition of done:** §6 item 14 met; all six detectors implemented; modal pre-ticks correctly; real-time SL-widen hook fires.

---

### Wave 2 — Prompt 5: Composite performance score

**Model:** **Opus 4.6** (it's a metric users will judge themselves by — get the math right).
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 2 Prompt 4.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 2 item 5 and §6 item 15. Read `CLAUDE.md` §1.2 — this metric must change behavior, not flatter it.
>
> Add a **Performance Score** (0–100) displayed alongside the Discipline Score on the Dashboard. Formula (write the rationale in a comment block at the top of the file):
>
> ```
> score = 0.30 * win_rate_score
>       + 0.25 * expectancy_score
>       + 0.20 * consistency_score
>       + 0.15 * profit_factor_score
>       + 0.10 * recency_score
> ```
>
> Definitions (all on closed trades only):
> - `win_rate_score`: linear, 0% → 0, 60% → 100, capped at 100.
> - `expectancy_score`: linear, -0.5R → 0, +1.0R → 100, capped.
> - `consistency_score`: 100 - (coefficient_of_variation_of_daily_PnL * 100), floored at 0.
> - `profit_factor_score`: linear, 1.0 → 50, 3.0 → 100, capped. Below 1.0 → 0.
> - `recency_score`: weighted toward last 14 days — last-14 contribution is 0.7 of the score, the rest is overall.
>
> All math in decimal.js. The formula constants live in `electron/services/performance-score/constants.ts` so they can be tuned without changing logic.
>
> UI: a small ring or bar with the number, a tooltip explaining the formula, "tap to see contribution breakdown" that opens a side panel.
>
> Tests: fast-check property tests for each component (e.g. monotonicity: higher win-rate → higher score, holding others fixed); a known-input integration test with a seeded set of 30 trades whose expected score is computed by hand and asserted to 1 decimal.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 15 met; score displays; breakdown panel works; tests pass; the math comment block accurately describes what the code does.

---

### Wave 2 — Prompt 6: Per-trade A–F quality grade

**Model:** Sonnet 4.6.
**Estimated agent time:** 75 min. **Your time:** +20 min.
**Prerequisites:** Wave 2 Prompt 5.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 2 item 6 and §6 item 16.
>
> For every closed trade, compute an A–F grade. The grade lives at the row level in the trade log and in the trade detail panel.
>
> Formula (`electron/services/trade-grade.ts`):
> ```
> baseline = 60
> + 20 if plan_followed (no rules broken)
> + 15 if R_outcome >= planned_R
> -  5 per rule broken
> + bonus for clean-on-tilt: +5 if emotional_state was Tilted at entry AND no rules broken
>
> grade =
>   A if score >= 90
>   B if score >= 75
>   C if score >= 60
>   D if score >= 45
>   F otherwise
> ```
>
> The grade is a **derived value**, computed at read time — do NOT add it as a column. (If performance demands later, cache it in a materialised view, but not now.) Document this in `docs/data-model.md`.
>
> UI: a small letter badge next to the trade ID in `/trades`, and a prominent letter on the trade detail. Colour: A green, B/C neutral, D/F amber/red but never alarming — match the spec voice.
>
> Tests: a unit-test matrix walking all five branches; a render test for the trade-log badge.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 16 met; grades appear in trade log + detail; tests pass.

---

### Wave 2 — Prompt 7: Notebook (free-form rich-text)

**Model:** Sonnet 4.6.
**Estimated agent time:** 120–180 min, possibly two sessions. **Your time:** +30 min.
**Prerequisites:** Wave 2 Prompt 6.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 2 item 7 and §6 item 17.
>
> Add a Notebook section, accessible from the sidebar, with three pre-loaded templates and the ability to create blank notes.
>
> Schema: new table `notebook_entry { id (UUIDv7), account_id (nullable — notes can be global or account-scoped), title, body_md (markdown source), created_at, updated_at, deleted_at, version }`. Migration with forward + backward test.
>
> Editor: a markdown editor with live preview. Use `@uiw/react-md-editor` or similar — do NOT roll your own rich-text editor. Save on blur and on Cmd+S. Each save bumps `updated_at`.
>
> Templates (created on first Notebook open, but only if no entries exist):
> 1. **Trading plan** — sections: Mandate, Instruments, Sessions, Setups, Risk per trade, Max daily loss, Rules I will break least often, How I know I'm tilted.
> 2. **Watchlist** — table with columns: Instrument, Bias, Key level, Killzone, Notes.
> 3. **Weekly review** — sections: Wins, Losses, Patterns observed, One change for next week.
>
> Search: a simple substring search across title + body.
>
> Cmd+K integration: add "New notebook entry" and "Search notebook" to the command palette (Wave 1 Prompt 5).
>
> Tests: migration test; create + edit + delete flow; template auto-seed only runs on empty notebook.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 17 met; three templates exist on first open; markdown editing works; Cmd+K commands present.

**After Wave 2:** push. The app now does most of what TradeZella does on the journal side, locally and free. Take 1–2 days off the keyboard; manually use the app yourself for a few real or paper trades.

---

## 8. v1.2 — WAVE 3: FILE IMPORT + TWO-PHASE LOGGING

**Wave goal:** kill the largest remaining friction by parsing broker statements directly, and split the heavy trade-log moment into a fast Gate (in-the-moment) + a calm Journal (deferred, batched).

**Wave duration estimate at 3–4 h/day:** ~18 working days.

### Wave 3 — Prompt 1: MT5 statement parser

**Model:** Sonnet 4.6, escalate to **Opus 4.6** for the price-math reconciliation (one Opus session inside).
**Estimated agent time:** 150–180 min. **Your time:** +60 min testing with real exports.
**Prerequisites:** Wave 2 done. Ask Akash for 2–3 real (anonymised) MT5 HTML statement exports to test against before starting — sample files belong under `tests/fixtures/import/mt5/`.

**Prompt:**
> Read `docs/integrations-future.md`, `docs/roadmap-v1.2.md` Wave 3 item 6 and §6 items 18 + 21.
>
> Build an MT5 statement import adapter that turns the broker's HTML/CSV export into Cairn trade rows. Live in `electron/services/import-adapters/mt5/`.
>
> Required:
>
> 1. **Parser:** read MT5's HTML statement export. The structure is a series of `<table>` blocks; the relevant ones are labelled "Deals" and "Orders" (the labels vary slightly by terminal language — match case-insensitively and tolerate a few translations: English, Spanish, German). Use `cheerio` or `parse5`.
> 2. **Reconciler:** MT5 records every deal (entry leg, partial close, full close) as a separate row keyed by order ticket. Group them into Cairn trades by `order_id`. A Cairn trade = one open + N closes. Partial closes go into `trade_partials` (the integer-encoded table from Wave 0 Prompt 2). Use decimal.js for every price/lot/P&L arithmetic.
> 3. **Mapping:** map MT5 symbol → Cairn pair using `electron/db/schema.ts` pairs. Unknown symbols are surfaced for the user to resolve, NOT silently dropped — block import until resolved.
> 4. **Idempotency:** importing the same statement twice produces zero new rows. Use the MT5 ticket number + open time as the dedupe key; store in a new column `external_ref` on `trades` and `trade_partials`. Migration with forward + backward test.
> 5. **Pre-import preview:** show the user a table — `N new trades, M skipped duplicates, K unresolved symbols`. Importing is a single click after preview.
> 6. **Tests:** unit tests against the fixture files; an integration test that imports, re-imports, and asserts no duplicates.
>
> Critical: the parser must tolerate slightly malformed HTML (MT5 exports are not strict). It must NOT silently drop rows — anything it cannot parse must be reported in the preview. NO `try { ... } catch { return null }` patterns that swallow data.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 18 met (partially — 21 lands here too if statements carry price series; otherwise 21 is the next prompt); preview UI works; re-import is a no-op.

---

### Wave 3 — Prompt 2: cTrader statement parser

**Model:** Sonnet 4.6.
**Estimated agent time:** 120 min. **Your time:** +45 min.
**Prerequisites:** Wave 3 Prompt 1.

**Prompt:**
> Read the cTrader HTML statement structure (Akash provides 2 fixture files in `tests/fixtures/import/ctrader/`).
>
> Build `electron/services/import-adapters/ctrader/` following the same shape as the MT5 adapter — separate parser + reconciler + mapper + idempotency, sharing `external_ref` semantics.
>
> Refactor common code (preview UI, dedupe by external_ref, symbol mapping) into `electron/services/import-adapters/_shared/` BEFORE writing cTrader-specific code. The two adapters must NOT each carry their own copy of the dedupe logic.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 19 met; cTrader import works; shared code factored; both adapters pass identical idempotency tests.

---

### Wave 3 — Prompt 3: TradingView CSV import

**Model:** Sonnet 4.6.
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 3 Prompt 2.

**Prompt:**
> Read the TradingView paper-trader / journal CSV format (Akash provides 2 fixture files in `tests/fixtures/import/tradingview/`).
>
> Build `electron/services/import-adapters/tradingview/`. Same shape. Same dedupe via `external_ref`. Use `papaparse` for the CSV. Decimal.js for prices.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 20 met; CSV import works; fixtures round-trip.

---

### Wave 3 — Prompt 4: MAE / MFE auto-compute from imported price series

**Model:** **Opus 4.6** (money + decimal + correctness-critical).
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 3 Prompts 1–3.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 3 item 7 and §6 item 21.
>
> When a statement import includes per-minute or per-tick price data for the trade window, compute MAE (max adverse excursion in R) and MFE (max favourable excursion in R) and store on the trade.
>
> Algorithm (`electron/services/mae-mfe.ts`):
> 1. Given trade `entry_price`, `sl_price`, `direction`, and a list of `{ ts, high, low }` candles between `open_time` and `close_time`:
> 2. `risk_per_unit = |entry_price - sl_price|`.
> 3. For each candle: `adverse_move = max(0, entry - low) if long else max(0, high - entry)`; `favourable_move = max(0, high - entry) if long else max(0, entry - low)`.
> 4. MAE = `max(adverse_move) / risk_per_unit` (in R). MFE = `max(favourable_move) / risk_per_unit`.
> 5. All math in decimal.js.
>
> If no price series is present in the import, MAE/MFE stay null. NO interpolation, NO guessing.
>
> Tests: fast-check property — MAE >= 0, MFE >= 0, MAE+ outcome relationship makes sense (a stopped-out trade has MAE >= 1R); a known-fixture test with hand-computed expected values.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 21 met; MAE/MFE populates from imports when data present; property tests pass.

---

### Wave 3 — Prompt 5: Two-phase logging — split the moment

**Model:** **Opus 4.6.** This is a structural change to the discipline pattern; getting the split wrong reintroduces the bad friction or worse, weakens the gate.
**Estimated agent time:** 180 min, almost certainly two sessions. **Your time:** +60 min.
**Prerequisites:** Wave 3 Prompts 1–4.

**Prompt:**
> Read `CLAUDE.md` §1.2 + §2.1 + §2.2 + §2.3, `docs/roadmap-v1.2.md` §4 Wave 3 two-phase block AND §6 item 22 (the ≤ 20 s gate target).
>
> Implement two-phase logging:
>
> **Phase 1 — The Gate (in the moment, target ≤ 20 s).** A "fast-path" New Trade panel toggle. Fields ONLY:
>   - pair (pre-filled from Wave 1 Prompt 1)
>   - direction
>   - entry, SL, TP (numeric; risk calc auto)
>   - one invalidation chip (Wave 1 Prompt 2)
>   - one emotional state preset (Wave 1 Prompt 3)
>   - submit
> The rule engine still runs in full — hard locks still block, daily-trade-limit still checks, max-daily-loss still gates. The honesty-invalidation chip is still required (one tap, but required). The trade enters the local DB with `phase_2_complete = false`.
>
> **Phase 2 — The Journal (deferred, batched).** When the trade closes (or is partial-closed), the close modal collects only the exit fields (exit price, exit time — and if statement import is enabled, even those are inferred). Everything else — rules-broken checklist (pre-ticked from Wave 2 Prompt 4), MAE/MFE confirmation, screenshot, free-text reflection, tags — is **deferred to the reflection queue**.
>
> **Reflection queue UI:** a section on the Review screen called "Trades awaiting reflection". A sidebar badge `cairn-reflection-pending` shows the count. The trader clears the queue at end-of-session in one calm pass, with keyboard nav between trades (J / K to move, R to mark reflected).
>
> Schema: add `phase_2_complete BOOLEAN NOT NULL DEFAULT FALSE` to `trades`. Migration with backward test. Existing closed trades are migrated to `phase_2_complete = true` (they were captured under the old single-phase flow).
>
> Settings: a toggle `pre_trade.fast_path_enabled` (default true). A trader who wants the old single-phase flow can turn it off; the settings panel must explain the trade-off honestly.
>
> Tests: a vitest scenario that runs the Phase-1 flow end-to-end and asserts the trade enters `phase_2_complete = false`; a scenario that closes the trade and asserts the reflection queue badge increments; a scenario that completes Phase 2 and asserts the badge decrements.
>
> Critical: the Gate must NOT skip any rule that exists today. The point is to make the *good* path faster, not to make the *bad* path easier.
>
> NO-SLOP FOOTER applies. Plus an extra check: open the app, place a trade via fast-path, time yourself with a stopwatch. If it takes > 20 s when you already know what to type, the Gate UI needs more work.

**Definition of done:** §6 item 22 met (≤ 20 s fast-path measured); §6 item 23 met (sidebar badge); migration runs; existing trades unaffected.

---

### Wave 3 — Prompt 6: Setup templates / playbooks

**Model:** Sonnet 4.6.
**Estimated agent time:** 120 min. **Your time:** +30 min.
**Prerequisites:** Wave 3 Prompt 5.

**Prompt:**
> Read `docs/roadmap-v1.2.md` Wave 3 item "setup templates" and §6 item 24.
>
> Per-account playbooks. Schema: new table `playbook { id (UUIDv7), account_id, name, pair, setup_id, killzone, required_confluence_md (markdown), default_risk_pct, default_invalidation_chip, created_at, updated_at, deleted_at, version }`. Migration with forward + backward test.
>
> UI:
> - **Playbooks tab in Settings** for an account — list, edit, delete, create.
> - **In the New Trade panel** (both the full and fast-path versions) — a "Use playbook" dropdown above the form. Selecting a playbook pre-fills pair / setup / killzone / risk % / invalidation chip. The trader still types live prices.
> - **In Analytics** — a per-playbook expectancy view: take the existing per-setup expectancy and add playbook as a grouping dimension.
>
> Cmd+K: add "New trade from playbook: <name>" entries dynamically.
>
> Tests: migration; CRUD per playbook; pre-fill behaviour in the New Trade panel.
>
> NO-SLOP FOOTER applies.

**Definition of done:** §6 item 24 met; playbook CRUD works; one-tap pre-fill works; per-playbook analytics visible.

**After Wave 3:** push, take 2–3 days off. v1.2 is **done** if every §6 item in `docs/roadmap-v1.2.md` is now true. Verify them one by one. Update CLAUDE.md §17 with a v1.2 Change Log. Tag the commit `v1.2.0`.

**Wave 4 (live broker integration) is OPTIONAL and is now scoped in §8.7 below.** It is the only wave with real moving parts (a shipped MT5 EA, a cTrader OAuth app, a long-lived listener). Decide separately whether to do it before, after, or instead of v2.0's cloud rebuild — nothing in Waves 0–3 or v2.0 depends on it.

---

## 8.7 v1.x — WAVE 4: LIVE BROKER INTEGRATION (MT5 + cTrader)

**Wave goal:** when the trader takes a trade in MetaTrader 5 or cTrader, it is captured by Cairn automatically — entry, lots, prices, times, partials, close — with no re-typing; and the rule engine watches the *live* position and warns the instant a rule is breached. This is the genuine realisation of "prevention over detection" for trades placed outside Cairn.

**Binding spec:** `docs/broker-integration.md` (read it in full before any prompt below). It is the source of truth for the transports, the `BrokerEvent` contract, the auto-log model, live detection, dedupe, and the security posture. The headlines, locked with Akash:

- **MT5 = local Expert Advisor → `127.0.0.1` socket bridge** (most local-first; instant). **cTrader = official Open API** (OAuth, read-only, streams execution events).
- **Auto-log is configurable.** Default **draft-awaiting-context** (mechanical fields prefilled, trade lands in the Wave 3 reflection queue, honesty fields stay `unreviewed`); a Settings toggle enables **fully-auto** (complete record, never queued). Neither mode invents honesty data, and neither runs the *pre-trade* gate — auto-log is capture (job #2), not prevention (job #1).
- **Read-only forever.** No adapter has an order-execution code path. Cairn never places, modifies, or closes a broker order. (Locked: `CLAUDE.md` §14 #6 + Wave 4 additions; financial-action safety boundary.)

**Wave duration estimate at 3–4 h/day:** ~16 working days (the MT5 EA and the cTrader OAuth handshake each eat a session in setup alone).

**Prerequisites:** v1.2 done and tagged `v1.2.0`. The Wave 3 import layer (`apps/desktop/electron/services/import-adapters/_shared/`: `symbol-resolver.ts`, `committer.ts`, `encoder.ts`) and two-phase logging (`phase`/`awaiting_reflection`/`reflected_at`, `listAwaitingReflection`, the Review queue + sidebar badge) must be in place — Wave 4 reuses all of them. If building after the v2.0 sync engine, the ingest service must write through `enqueueSyncOp` (see the import-adapter sync-gap follow-up).

> **Path note:** these prompts assume the monorepo layout (`apps/desktop/electron/...`). If Wave 4 is built before the v2.0 monorepo move, substitute `electron/...`.

### Wave 4 — Prompt 1: Internal `BrokerEvent` contract + ingest service skeleton

**Model:** **Opus 4.6** (defines the typed boundary every later prompt builds on; money-encoding-critical).
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** v1.2 done.

**Prompt:**
> Read `docs/broker-integration.md` (all), `CLAUDE.md` §2.1/§2.3/§2.5/§19.5, and the Wave 3 shared import layer in `apps/desktop/electron/services/import-adapters/_shared/`.
>
> Build the transport-agnostic core, no live transport yet:
>
> 1. Define `BrokerEvent`, `BrokerEventType`, and `LiveBrokerAdapter` (extends the existing `BrokerAdapter`) in `packages/shared-types/` per spec §4. No `any`. Money/pips are broker-native numbers on the event; storage encoding is integer-only.
> 2. Create `apps/desktop/electron/services/broker/` with an `ingest.ts` service: takes a `BrokerEvent`, maps the symbol via the Wave 3 `_shared/symbol-resolver.ts`, encodes money/pips via `_shared/encoder.ts` (decimal.js — never float), and upserts a `trades`/`trade_partials` row using `external_ref = brokerTradeId` with `ON CONFLICT DO UPDATE` (never a second insert). Reuse the Wave 3 `committer.ts` write path; do not fork it.
> 3. The service runs in the main process and exposes a typed IPC `broker:status` + emits a `cairn:event` `trade.placed`/`trade.closed` on each applied event so the dashboard updates (reuse the Wave 2 event bus).
> 4. No transport, no UI, no detection in this prompt — just the contract + ingest + dedupe, with a fake event source in tests.
>
> Tests: feed a recorded `position_opened` → `partial_close` → `position_closed` sequence and assert one trade + correct integer-encoded partials; feed the same sequence twice and assert zero duplicate rows (external_ref dedupe); fast-check property that lot/price encoding round-trips.
>
> NO-SLOP FOOTER applies. Money rules (§3) and boundaries (§4) are binding.

**Definition of done:** `BrokerEvent` contract committed in shared-types; ingest service upserts + dedupes by `external_ref`; no float storage; tests green; no transport code yet.

### Wave 4 — Prompt 2: Auto-log model (draft-awaiting-context + fully-auto) + Settings

**Model:** **Opus 4.6** (touches the honesty forcing-functions and analytics correctness).
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 4 Prompt 1.

**Prompt:**
> Read `docs/broker-integration.md` §3, `CLAUDE.md` §2.3 (honesty forcing functions), and the Wave 3 two-phase logging code (`phase`/`awaiting_reflection`/`reflected_at`, `listAwaitingReflection`, `completePhase2`, the Review-screen queue, the sidebar badge).
>
> Make the ingest service honour a configurable auto-log mode:
>
> 1. Add a setting `broker.auto_log_mode: 'draft_awaiting_context' | 'fully_auto'` (default `draft_awaiting_context`) in Settings → Integrations, with copy stating plainly that auto-log is *capture, not pre-trade prevention*.
> 2. **draft_awaiting_context:** the applied trade is created with mechanical fields filled and `awaiting_reflection = true` so it appears in the existing reflection queue + sidebar badge. Honesty fields (invalidation, emotion, plan-followed, rules-broken, reflection) stay **null/`unreviewed`** — never defaulted to clean.
> 3. **fully_auto:** the trade is written complete and never enters the queue; honesty fields stay `unreviewed`.
> 4. **Analytics correctness (critical):** composite score, A–F grade, and clean-rate must treat `unreviewed` distinctly from `clean`. Audit `electron/services/analytics/composite-score.ts`, `src/lib/trade-grade.ts`, and clean-rate queries; a trade Cairn never reviewed must not count as a clean trade. Add an `unreviewed` state if the schema implies "clean by absence" today.
>
> Tests: a fill in each mode produces the correct queue/honesty state; an `unreviewed` trade is excluded from clean-rate and does not grade as if clean; the Settings toggle round-trips.
>
> NO-SLOP FOOTER applies. The honesty boundary in spec §3 is the binding constraint — do NOT let auto-logging fabricate self-assessment.

**Definition of done:** both modes work; default is draft; `unreviewed` never counts as clean anywhere in analytics; Settings copy states capture-not-prevention; tests green.

### Wave 4 — Prompt 3: MT5 Expert Advisor (bridge) + localhost listener

**Model:** **Opus 4.6** for the listener/auth/framing (security boundary); the MQL5 EA itself is Sonnet 4.6.
**Estimated agent time:** 150 min, likely two sessions (MQL5 + the Node listener). **Your time:** +60 min, including a manual install into a real MT5 demo terminal.
**Prerequisites:** Wave 4 Prompts 1–2. Have an MT5 demo account + terminal ready to test against.

**Prompt:**
> Read `docs/broker-integration.md` §2.1 and §8. Build the MT5 → Cairn bridge.
>
> 1. **EA (MQL5)** in `apps/desktop/resources/mt5-bridge/CairnBridge.mq5`: subscribe to `OnTradeTransaction`; serialise each transaction to the `BrokerEvent` JSON shape; send length-prefixed frames over a TCP socket to `127.0.0.1:<port>` using MQL5's native `Socket*` API; emit a heartbeat every N seconds. The EA takes a pairing-token input and includes it on every frame. It is **read-only** — it must contain NO `OrderSend`/`OrderModify`/`OrderClose`/`trade.*` execution calls. Add a one-page `INSTALL.md` next to it.
> 2. **Listener** in `apps/desktop/electron/services/broker/mt5/listener.ts`: a loopback-only TCP server bound to `127.0.0.1` (never `0.0.0.0`), per-install pairing token check, frame size cap, JSON parse → `BrokerEvent` → hand to the Prompt-1 ingest service. Reject non-local connections and bad tokens; log (no PII) and drop malformed frames without crashing.
> 3. **Settings → Integrations → MT5:** show the pairing token, the `MQL5/Experts` destination path, and a live "EA connected / last event Xs ago / disconnected" indicator driven by `broker:status` + the heartbeat.
> 4. Wrap the listener as a `LiveBrokerAdapter` (`broker: 'mt5'`).
>
> Tests: a fixture that replays recorded EA frames into the listener and asserts the ingest service receives correct `BrokerEvent`s; a security test that a connection from a non-loopback address is refused; a test that a frame with a wrong/absent token is rejected; a **grep test** asserting the MQL5 file contains no order-execution calls.
>
> NO-SLOP FOOTER applies. The loopback-only + token + size-cap posture (spec §8) is binding; the read-only assertion is non-negotiable.

**Definition of done:** EA installs and connects to a real MT5 demo; taking a demo trade produces a Cairn trade per the active auto-log mode; non-local + bad-token connections refused; no execution path in the EA; tests green; manual smoke confirmed against a live terminal.

### Wave 4 — Prompt 4: cTrader Open API adapter (OAuth, read-only stream)

**Model:** **Opus 4.6** (OAuth token handling + keychain + read-only scope = security-critical).
**Estimated agent time:** 150 min, likely two sessions (Spotware app registration + OAuth + Protobuf stream). **Your time:** +60 min, including the OAuth consent round-trip with a real cTrader account.
**Prerequisites:** Wave 4 Prompts 1–2. Register a Spotware Open API application first (Akash does this; it yields a client id/secret).

**Prompt:**
> Read `docs/broker-integration.md` §2.2 and §8. Build the cTrader live adapter in `apps/desktop/electron/services/broker/ctrader/`.
>
> 1. **OAuth 2.0 authorization-code flow** (read-only scopes). Store access + refresh tokens in the OS keychain via `keytar` — never plaintext on disk. Refresh on expiry. The client id/secret come from env/config, never source (`gitleaks` clean).
> 2. **Stream:** open the Open API connection (Protobuf over TLS), authorise the account, subscribe to order/position execution events, and map each to a `BrokerEvent` (`broker: 'ctrader'`). Map cTrader symbols via the Wave 3 `_shared/symbol-resolver.ts`.
> 3. Wrap as a `LiveBrokerAdapter`; reconnect with backoff on drop; surface status to `broker:status`.
> 4. **Settings → Integrations → cTrader:** connect/disconnect, connection status, and a disclosure that events transit Spotware (read-only inbound), unlike the on-device MT5 bridge.
>
> Tests: map a set of recorded cTrader execution payloads to `BrokerEvent`s and assert the ingest output; a token-refresh unit test; a test asserting no order-execution call exists in the adapter surface. Mock the network — no live Spotware calls in CI.
>
> NO-SLOP FOOTER applies. Secrets/logs (§5) are binding: tokens in keychain, none in logs, read-only scopes only.

**Definition of done:** cTrader connects via OAuth against a real account; an executed trade streams into Cairn per the active auto-log mode; tokens in keychain; read-only; reconnect works; tests green (network mocked).

### Wave 4 — Prompt 5: Live detection — real-time rule warnings on the open position

**Model:** **Opus 4.6.** Rule-engine surface; "prevention over detection" is the app's reason to exist.
**Estimated agent time:** 120 min. **Your time:** +45 min.
**Prerequisites:** Wave 4 Prompts 3 **and** 4 (so detection works for both sources).

**Prompt:**
> Read `docs/broker-integration.md` §5, `docs/rules-engine.md`, and the Wave 2 real-time hooks (`no_sl_widening`, `no_tp_narrowing`, `position_size_matches_plan`) — extend the existing engine, do NOT bolt detection on outside it.
>
> On each `position_opened`/`position_modified` `BrokerEvent`, evaluate the account's rules against the live position and raise **non-blocking** warnings (Cairn cannot block a broker order; it can only alert) for: SL widened against the position, size increased mid-trade beyond tolerance, TP cut toward entry, daily-trade-limit exceeded, trading after the max-daily-loss circuit breaker tripped this session, and trade outside the configured killzones.
>
> - **Plan source:** if a Cairn pre-trade draft for the same symbol/direction was logged shortly before the fill, link the live trade to it and measure against that plan. Otherwise the first observed SL/TP/size is the baseline; subsequent modifications are measured against it.
> - **Surfacing:** mentor-voice toast/log (`CLAUDE.md` §1 voice — calm, direct, no emoji) and a persisted `rule_violations` row so the breach appears in analytics and at reflection time.
> - Settings copy must state these are detections (warnings), not blocks.
>
> Tests: a vitest suite per detector driven by `BrokerEvent` sequences (e.g. open then a widen-SL modify → SL-widen warning + `rule_violations` row); a test that a clean trade raises nothing; a test that a linked-draft plan is used as the baseline when present.
>
> NO-SLOP FOOTER applies. Prevention is the north star (§14 #14): the warning must fire on the modify event, not at close.

**Definition of done:** all six live detectors fire on the open position from both MT5 and cTrader streams; warnings are non-blocking, mentor-voice, and recorded as `rule_violations`; plan-linking works; tests green.

### Wave 4 — Prompt 6: Reconciliation with statement import + closeout

**Model:** Sonnet 4.6 (escalate to **Opus 4.6** for the conflict-resolution money rule).
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Wave 4 Prompts 1–5.

**Prompt:**
> Read `docs/broker-integration.md` §6 and §7, and the Wave 3 import adapters.
>
> 1. Guarantee a live-streamed trade and the same trade later appearing in a statement import resolve to ONE row via `external_ref = brokerTradeId`. On conflict, the statement (settled record) wins for monetary fields; the live stream wins for intra-trade timing/modification history. Document the rule inline.
> 2. If building on top of the v2.0 sync engine: confirm the ingest service writes through `enqueueSyncOp` so streamed fills sync to the web app (close this if the import-adapter sync-gap follow-up hasn't already).
> 3. Update docs: append a "Wave 4 — DONE" note to `docs/build-status.md` with commit hashes; tick the Wave 4 end-state list in `docs/roadmap-v1.2.md` §6.1; update the `CLAUDE.md` §17.5 Wave 4 row and §17.6 headline.
> 4. Manual end-to-end: take a demo trade in MT5 and one in cTrader, watch both auto-log per the active mode, modify a stop to trigger a live warning, then import the day's statement and confirm no duplicates.
>
> NO-SLOP FOOTER applies.

**Definition of done:** no double-counting live-vs-import (tested); conflict rule implemented + documented; (if post-sync) streamed trades sync; docs updated; manual two-broker smoke passes. **Wave 4 is complete** — tag `v1.x-wave4-live-broker`.

**After Wave 4:** this is the only wave that depends on external setup (an installed EA, a Spotware app). If either platform changes its surface, the `LiveBrokerAdapter` interface localises the blast radius to one adapter. Everything in Waves 0–3 keeps working untouched.

---

## 8.5 v0.1.1 RELEASE HOTFIX — PACKAGED MIGRATION PATH (DONE 2026-06-03)

**Status:** ✅ APPLIED to this folder on 2026-06-03. This documents a release-blocking bug that was first found and fixed in a *separate copy* of this repo (the one published to GitHub and installed), then replicated here so both trees match. No behavioural change in `pnpm dev`; the fix only affects packaged installer builds.

### The bug

The app worked perfectly in `pnpm dev` but the **packaged Windows installer failed on first launch** during onboarding with:

```
Error: Can't find meta/_journal.json file
```

Database initialization threw inside `migrate(db, { migrationsFolder })` because Drizzle could not locate the migrations directory in the installed app.

### Root cause

Path mismatch in the packaged build. Drizzle migrations are bundled **inside the asar archive** at:

```
resources/app.asar/electron/db/migrations
```

but the runtime was looking for them at:

```
resources/migrations        ← join(process.resourcesPath, 'migrations')
```

`process.resourcesPath` resolves to `<install>/resources`, so the lookup pointed at a folder that does not exist. Compounding it, `electron-builder.yml` never explicitly listed the migration folder in `files`, so it was not guaranteed to be packaged at all. Dev mode worked because it used the `__dirname`-relative branch, which resolves correctly from `out/main/`.

### The fix (two files)

**1. `electron/db/index.ts`** — point the packaged branch at the real location inside the asar:

```ts
// before
const migrationsFolder = app.isPackaged
  ? join(process.resourcesPath, 'migrations')
  : join(__dirname, '..', '..', 'electron', 'db', 'migrations')

// after
const migrationsFolder = app.isPackaged
  ? join(process.resourcesPath, 'app.asar', 'electron', 'db', 'migrations')
  : join(__dirname, '..', '..', 'electron', 'db', 'migrations')
```

**2. `electron-builder.yml`** — explicitly package the migration folder so it is always copied into the asar:

```yaml
files:
  - out/**/*
  - electron/db/**/*        # ← added
  - package.json
  - "!**/.{git,svn}"
  - "!**/node_modules/.cache"
```

### Prompt used to replicate (for reference / re-running)

> Read `CLAUDE.md` §2.5 (data integrity) and the v0.1.1 launch-failure analysis. The packaged Windows installer fails on first launch with `Can't find meta/_journal.json file` because Drizzle migrations are packaged inside `resources/app.asar/electron/db/migrations` but the runtime looks for them at `resources/migrations`. Apply exactly two changes: (1) in `electron/db/index.ts`, change the `app.isPackaged` migrations path from `join(process.resourcesPath, 'migrations')` to `join(process.resourcesPath, 'app.asar', 'electron', 'db', 'migrations')`; (2) in `electron-builder.yml`, add `- electron/db/**/*` to the `files` list. Do not change the dev (`__dirname`-relative) branch. Then run the five quality gates and verify the migration files appear in the asar.

### Definition of done / verification

```
[ ] pnpm typecheck && pnpm lint --max-warnings 0 && pnpm test   — all green
[ ] pnpm dev still launches and onboards (regression check)
[ ] pnpm dist (or pnpm build && electron-builder) produces an installer
[ ] npx asar list dist/win-unpacked/resources/app.asar | findstr migrations
       → shows electron\db\migrations\meta\_journal.json and the .sql files
[ ] Install the .exe on a clean machine → onboarding completes, no _journal.json error
[ ] git commit -m "fix(build): resolve packaged migrations path inside app.asar (v0.1.1)"
```

> Note: the GitHub-published copy was already fixed and confirmed working after reinstall. This folder now carries the identical change.

**Model:** Sonnet 4.6 (mechanical two-line fix); no Opus needed.

---

## 9. v2.0 — STAGE 0: ENGINEERING QUALITY BASELINE

**Stage goal:** lock in §19 (no-slop) before any new feature work. Everything downstream depends on this.

**Stage duration estimate at 3–4 h/day:** 3 working days.

### Stage 0 — Prompt 1: ESLint + CI + Husky + ADR-0001

**Model:** **Opus 4.6** (architecture + CI setup, foundation-level).
**Estimated agent time:** 180 min, plausibly two sessions. **Your time:** +60 min.
**Prerequisites:** v1.2 tagged.

**Prompt:**
> Read `CLAUDE.md` §2.12, §3, §14 #25, §18.2, §19 (the whole section), and `docs/conventions.md`.
>
> Implement the §19 no-slop baseline. Do NOT add features.
>
> 1. **TypeScript strict everywhere:** verify `tsconfig.json` (and `tsconfig.node.json`) have `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`. Fix every error that appears. Use `unknown` and proper type guards instead of `any`. If a library is untyped, write a `.d.ts` wrapper in `src/types/<lib>.d.ts`.
> 2. **ESLint:** install `@typescript-eslint/eslint-plugin@strict`, `eslint-plugin-import`, `eslint-plugin-promise`. Enable: `no-floating-promises`, `no-explicit-any` (error), `no-console` (error, with `warn`/`error` allowed only inside `electron/main.ts` error handlers), `consistent-return`, `import/order`, `no-restricted-imports` (block `lodash` if not already used; force `lodash-es`). Make `pnpm lint` fail on any warning.
> 3. **Prettier:** ensure `pnpm format:check` runs in CI.
> 4. **Husky + lint-staged:** pre-commit runs `pnpm typecheck`, `pnpm lint --max-warnings 0` on staged files, `pnpm format:check`.
> 5. **commitlint:** Conventional Commits enforced on commit-msg hook.
> 6. **GitHub Actions CI:** add `.github/workflows/ci.yml`. Jobs: `typecheck`, `lint`, `test`, `build`, `audit` (`npm audit --production --audit-level=high`). All run on PR and on push to main. Block merge if any fail.
> 7. **Renovate:** add `renovate.json` weekly. Or Dependabot if you prefer; Renovate is more powerful for monorepos.
> 8. **License check:** add `scripts/check-licenses.ts` that walks `node_modules` and fails on GPL/AGPL transitives. Wire into CI.
> 9. **gitleaks:** add `.github/workflows/gitleaks.yml` running on every PR.
> 10. **Sentry:** install `@sentry/electron` for main + renderer. Wire behind `settings.telemetry.optIn` (default false). When false, init is a no-op. NEVER initialise without the flag.
> 11. **ADR folder:** create `docs/adr/`. Write `0001-local-first-with-e2e-sync.md` explaining the v2.0 architecture decision per CLAUDE.md §18.0. Format: Status / Context / Decision / Consequences. Future ADRs follow this.
> 12. **Pull request template:** `.github/pull_request_template.md` with the No-Slop checklist.
> 13. **Coverage gate:** `vitest.config.ts` → `coverage.threshold.global = { lines: 70, statements: 70, branches: 65, functions: 70 }` for now. Document the climb in `docs/conventions.md`: 70 → 75 by end of Stage 3 → 80 by end of Stage 6.
>
> CI must be **green** before you finish — fix every existing lint or type error you encounter. Do not commit a red CI.
>
> NO-SLOP FOOTER applies in full.

**Definition of done:** every item above present; CI green on a fresh PR; ADR-0001 written.

---

### Stage 0 — Prompt 2: Monorepo move (apps/desktop)

**Model:** **Haiku 4.5** for the mechanical moves, **Sonnet 4.6** to fix imports.
**Estimated agent time:** 90 min. **Your time:** +30 min.
**Prerequisites:** Stage 0 Prompt 1.

**Prompt:**
> Read `CLAUDE.md` §3.3 (v2.0 monorepo layout) and §18.3.
>
> Convert the repo to a pnpm workspace monorepo.
>
> 1. Create `pnpm-workspace.yaml` with `apps/*` and `packages/*`.
> 2. `git mv electron apps/desktop/electron`. `git mv src apps/desktop/src`. `git mv shared apps/desktop/shared`. `git mv tests apps/desktop/tests`. Update `package.json` to be the workspace root; move app-specific deps to `apps/desktop/package.json`.
> 3. Create empty `packages/shared-types/`, `packages/shared-zod/`, `packages/sync-protocol/`, `packages/billing-types/`. Each has its own `package.json` (private), `tsconfig.json`, `src/index.ts`.
> 4. Update every import in `apps/desktop/` so paths still resolve (relative paths are unchanged; only the top-level moved). Update `electron-vite.config.ts`, `tailwind.config.ts`, `vitest.config.ts`, `electron-builder.yml` for the new paths.
> 5. `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all green from the workspace root.
> 6. Commit the move as a single commit titled `chore: convert to pnpm workspace monorepo`. Git blame is preserved because `git mv` was used.
>
> Do NOT add new features. Do NOT change `apps/desktop/` code beyond import-path fixes.
>
> NO-SLOP FOOTER applies.

**Definition of done:** workspace exists; tests green from root; one commit; blame preserved.

---

## 10. v2.0 — STAGE 1: FINISH & STABILIZE v1.1 (post-v1.2 audit)

**Stage goal:** since v1.2 already shipped, this stage is mostly a v1.1 spec audit (§16.a) — most items are now true. Catch the few that aren't, plus the decimal.js conversion if not done.

**Stage duration estimate at 3–4 h/day:** 4–6 days.

### Stage 1 — Prompt 1: §16.a audit + decimal.js conversion sweep

**Model:** **Opus 4.6** for the P&L conversion; **Sonnet 4.6** for the audit walk.
**Estimated agent time:** 180–240 min, two sessions. **Your time:** +60 min.
**Prerequisites:** Stage 0.

**Prompt:**
> Read `CLAUDE.md` §16.a (all 17 items) and §19.5.
>
> Step 1: walk each §16.a item against the live `apps/desktop/`. Produce a punch-list of unmet items. Many will be met (v1.2 likely covered most). Open TodoWrite entries for the ones that aren't.
>
> Step 2: convert all monetary and pip math in `apps/desktop/electron/services/pnl-calculator.ts` and any helper it calls to `decimal.js` if not already. The conversion must:
> - Replace every `number` representing money or pips with `Decimal`.
> - Replace every `+`, `-`, `*`, `/` on those values with the `Decimal` methods.
> - Add fast-check property tests: associativity holds within decimal precision; scale-invariance for R-multiple (multiply entry/SL/TP/exit by k → R unchanged).
> - Add a migration test that runs all existing migrations forward + backward on a fresh DB and on a seeded DB.
>
> Step 3: deliver the punch-list as a markdown report committed to `docs/v1.1-audit-<date>.md`.
>
> NO-SLOP FOOTER applies, §19.5 hardest.

**Definition of done:** every §16.a item is true OR has a follow-up TodoWrite; decimal.js conversion complete; property tests green; migration test passes.

---

## 11. v2.0 — STAGE 2: SYNC-READY DATA MODEL + CRYPTO

**Stage goal:** every local SQLite row is sync-ready, and the crypto library is in place — without yet performing any encryption or network call.

**Stage duration estimate at 3–4 h/day:** 8–12 days.

### Stage 2 — Prompt 1: Add sync columns to every syncable table

**Model:** **Opus 4.6.** Schema migration on every table = high blast radius.
**Estimated agent time:** 150 min. **Your time:** +45 min.
**Prerequisites:** Stage 1.

**Prompt:**
> Read `CLAUDE.md` §18.4, `docs/data-model.md`, and existing migrations in `apps/desktop/electron/db/migrations/`.
>
> Add to every **syncable** table (NOT ephemeral / UI-state tables like `session_state`, `ui_pref` — list explicitly in the commit message which tables you excluded and why):
>
> - `id` — UUIDv7 if not already; if existing rows use integer primary keys, add `uuid TEXT UNIQUE NOT NULL DEFAULT (<generator>)` and migrate references over a follow-up prompt.
> - `updated_at INTEGER NOT NULL` — ms since epoch UTC.
> - `deleted_at INTEGER NULL` — soft-delete tombstone.
> - `device_id TEXT NOT NULL` — id of the device that last touched the row.
> - `version INTEGER NOT NULL DEFAULT 0` — Lamport counter incremented on every write.
> - `dirty INTEGER NOT NULL DEFAULT 1` — bit indicating "needs upload."
>
> Also create:
>
> - `device { id, name, os, created_at, last_seen_at }`
> - `vault_meta { user_id (nullable for offline), salt, kdf_iterations, wrapped_data_key, key_version, schema_version, created_at, updated_at }`
> - `sync_queue { op_id (UUIDv7), table, record_id, op_type ('insert' | 'update' | 'delete'), payload_ciphertext (BLOB), created_at }`
>
> Migration with forward + backward test on a seeded DB. Every existing row gets `updated_at = now`, `device_id = bootstrap-uuid`, `version = 0`, `dirty = 1`.
>
> Every existing IPC handler that writes a row must now bump `version` and set `dirty = 1`. Make this a single shared helper `applySyncMeta(record)` in `apps/desktop/electron/db/sync-meta.ts` so each handler is a one-liner.
>
> Tests: a vitest scenario that updates a trade, asserts `version` bumped and `dirty = 1`; a migration test forward and backward.
>
> NO record encryption yet. Existing data continues to work plaintext. This stage only adds capability.
>
> NO-SLOP FOOTER applies, §19.6 hardest.

**Definition of done:** migration runs; every syncable table has the six columns; handlers bump version; tests pass.

---

### Stage 2 — Prompt 2: Crypto library (libsodium, Argon2id, XChaCha20-Poly1305)

**Model:** **Opus 4.6.** Non-negotiable. Crypto in `Sonnet` would be slop by definition.
**Estimated agent time:** 240 min, two-three sessions. **Your time:** +90 min.
**Prerequisites:** Stage 2 Prompt 1.

**Prompt:**
> Read `CLAUDE.md` §2.4, §2.13, §18.4, §19.1–19.4. Write `docs/security.md` as your FIRST act of this prompt — Status, Threat model summary, Crypto primitives, KDF params with rationale, Data key wrap/unwrap, Recovery phrase, OS keychain usage, KEK rotation plan. Use real numbers, not "TODO."
>
> Then implement `packages/shared-types/src/crypto.ts` (the types) and `apps/desktop/electron/services/crypto/` (the implementation). Use `libsodium-wrappers` (battle-tested) — not @stablelib (less reviewed).
>
> Functions:
> - `deriveKEK(password: string, salt: Uint8Array, params: KDFParams): Promise<Uint8Array>` — Argon2id, params from `vault_meta`. Defaults: memlimit `INTERACTIVE` (≈ 64 MiB), opslimit 3, output 32 bytes.
> - `wrapDataKey(dataKey, kek): WrappedKey` — XChaCha20-Poly1305 with a fresh 24-byte nonce.
> - `unwrapDataKey(wrapped, kek): Uint8Array` — throws `WRONG_KEY` typed error on tag mismatch.
> - `encryptRecord(plaintext: Uint8Array, dataKey, ad?: Uint8Array): EncryptedRecord` — XChaCha20-Poly1305, fresh nonce, associated data optional (use `table:id` as AD to bind a ciphertext to its row).
> - `decryptRecord(record, dataKey, ad?): Uint8Array`.
> - `generateRecoveryPhrase(): { phrase: string[24], entropy: Uint8Array }` — BIP-39 wordlist.
> - `keyFromRecoveryPhrase(phrase): Promise<Uint8Array>` — re-derives KEK from the phrase (using a separate Argon2id config so phrase ≠ password).
>
> Critical:
> - No `any`. Every public function has TSDoc.
> - Every function has unit tests with **RFC test vectors** (libsodium ships these).
> - Round-trip property tests via fast-check: encrypt then decrypt yields original; wrong AD fails to decrypt; tampered ciphertext fails to decrypt; wrong key fails to decrypt.
> - Negative tests are mandatory — show the function REFUSES, not just that it accepts.
> - NEVER log plaintext, key material, or nonces. Pino redactor list updated.
>
> The OS keychain interface goes in `apps/desktop/electron/services/keychain.ts` using `keytar`. Stores: `cairn:dataKey:<userId>` → unwrapped data key bytes. Read on app start; clear on lock.
>
> Do NOT yet encrypt any actual rows. Stage 2's scope ends here.
>
> NO-SLOP FOOTER applies in full. Plus an extra item: a second pass with a fresh Opus session reviewing the diff before merge. Mandatory per §19.11.

**Definition of done:** `docs/security.md` exists and is honest; crypto module exists with RFC-vector + property tests; keychain wrapper exists; nothing in the app actually encrypts yet; second-model review documented.

**After Stage 2:** push. v1.2 + v2.0 Stage 0–2 means a polished, hardened, future-proof local app. No backend yet, no risk yet. Take a couple days.


---

## 12. v2.0 — STAGE 3: BACKEND CORE

**Stage goal:** stand up the Fastify API. Auth (with refresh-reuse detection), vault blob storage (opaque ciphertext only), device registry, billing webhook scaffolding. Mock providers — no real Stripe/Razorpay yet.

**Stage duration estimate at 3–4 h/day:** 14–18 working days. Two prompts in this stage are the biggest in the whole roadmap; split them across multiple sessions if needed.

### Stage 3 — Prompt 1: API skeleton + database schema + env validation

**Model:** **Opus 4.6.** Foundation choices echo for years.
**Estimated agent time:** 180 min. **Your time:** +45 min.
**Prerequisites:** Stage 2 done.

**Prompt:**
> Read `CLAUDE.md` §3.1b, §3.4, §3.5, §3.7, §18.5, §19 (all of it), §20 (all of it).
>
> Create `apps/server/`. TypeScript strict + Fastify + Drizzle (Postgres) + Zod + Pino.
>
> 1. **Scaffold:** `apps/server/{src,tests,Dockerfile,docker-compose.yml,package.json,tsconfig.json,drizzle.config.ts,.env.example}`. Workspace deps via `pnpm`.
> 2. **Env validation:** `src/env.ts` reads env once via Zod. Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER`, `RESEND_API_KEY` (or `POSTMARK_TOKEN`), `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CORS_ORIGINS` (CSV), `LOG_LEVEL`. Server throws if any are missing.
> 3. **Drizzle schema** in `src/db/schema.ts`:
>    - `user { id (UUIDv7), email (citext, unique), email_verified_at, created_at, updated_at }`
>    - `user_credential { user_id, password_hash, password_algo ('argon2id'), updated_at }`
>    - `user_session { id, user_id, refresh_token_hash (sha-256 of opaque token), refresh_family_id, issued_at, expires_at, revoked_at, replaced_by, user_agent, ip_hash }` — refresh-reuse detection via family_id.
>    - `email_token { user_id, kind ('verify' | 'magic' | 'reset'), token_hash, expires_at, consumed_at }`.
>    - `device { id, user_id, name, os, created_at, last_seen_at }`.
>    - `vault { user_id (PK), salt, kdf_iterations, kdf_memlimit, kdf_opslimit, wrapped_data_key, key_version, schema_version, created_at, updated_at }`.
>    - `vault_blob { user_id, op_id (UUIDv7, PK with user_id), table, record_id, op_type, payload_ciphertext (BYTEA), nonce (BYTEA), ad (BYTEA), created_at }` — server never decrypts.
>    - `audit_log { id, user_id (nullable), kind, severity, payload_json, created_at, request_id }`.
>    - `subscription { id, user_id, provider ('stripe'|'razorpay'), provider_subscription_id, plan_id, status ('trial'|'active'|'past_due'|'canceled'), current_period_end, trial_ends_at, canceled_at, updated_at }`.
>    - `webhook_event { id, provider, external_id, payload_json, received_at }` — UNIQUE(provider, external_id) for idempotency.
> 4. **Migrations** generated via `drizzle-kit generate`. Initial migration + forward/backward test in `tests/integration/migrations.test.ts`. Use a Docker-Compose Postgres in CI.
> 5. **Fastify shell:** `src/app.ts` — `helmet`, `cors` with allowlist from env, `@fastify/rate-limit`, `@fastify/sensible`, JSON-only with body size limit 100 KB by default (overridable per route for vault push), strict Content-Type. Request id propagation via `x-request-id`. Pino with redact list: `password`, `token`, `secret`, `ciphertext`, `Authorization`, `cookie`.
> 6. **`/health` route:** returns `{ ok: true, version, commit, db: 'up'|'down' }`. Used by load balancers.
> 7. **`docker-compose.yml`:** Postgres 16, the API, Mailpit for transactional email testing.
> 8. **OpenAPI:** `@fastify/swagger` + Scalar UI at `/docs`, gated behind `NODE_ENV !== 'production'` OR an admin token.
> 9. **Result contract:** every route returns `{ ok: true, data } | { ok: false, error: { code, message, details? } }`. Error codes enumerated in `packages/shared-types/src/error-codes.ts`.
>
> NO real Stripe/Razorpay calls. NO frontend code. NO auth routes yet (next prompt).
>
> Write `docs/backend-architecture.md` documenting: deployment topology (single Fastify behind LB → Postgres → Redis), why Fastify, why Drizzle on both ends, the request-life-cycle middleware order, the env contract.
>
> NO-SLOP FOOTER applies in full. Plus: gitleaks must report clean. `.env` is gitignored. `.env.example` has every variable with a comment and fake value.

**Definition of done:** `pnpm --filter @cairn/server dev` boots; `/health` returns 200; migrations apply cleanly via compose; `docs/backend-architecture.md` exists.

---

### Stage 3 — Prompt 2: Auth (Argon2id + JWT + refresh rotation + reuse detection)

**Model:** **Opus 4.6.** Auth bugs are the longest tail.
**Estimated agent time:** 240 min, two sessions. **Your time:** +90 min.
**Prerequisites:** Stage 3 Prompt 1.

**Prompt:**
> Read `CLAUDE.md` §2.13, §18.5, §19.4, §19.11.
>
> Implement auth in `apps/server/src/auth/`:
>
> 1. **Password hashing:** `@node-rs/argon2`, params: memlimit 64 MiB, time cost 3, parallelism 1, output 32 bytes; pepper from `PASSWORD_PEPPER` env (HMAC the password with pepper before hashing). NEVER fall back to bcrypt or SHA.
> 2. **Signup** `POST /auth/signup`: rate limited per IP (5 / 15 min) and per email (3 / hour). Body validated. Creates user + credential. Sends verify email via Resend/Postmark. Returns `{ ok: true, data: { userId } }` without leaking whether the email already existed (timing safe).
> 3. **Email verify** `POST /auth/verify`: consumes the token, sets `email_verified_at`. Tokens single-use, 24 h expiry, sha-256 hashed in DB.
> 4. **Login** `POST /auth/login`: rate limited 5 / 15 min per IP + per email. Verifies password (constant-time compare via the Argon2 verifier). Issues access JWT (15 min, HS256, includes `userId`, `emailVerified`, `entitlement: 'free'|'trial'|'pro'`) and an opaque refresh token (32 bytes random, sha-256 stored, 30 day expiry). Refresh token returned as `__Host-refresh` cookie (`SameSite=Strict`, `Secure`, `HttpOnly`, path `/auth/refresh` only). A new `user_session` row stores the hashed refresh + family_id.
> 5. **Refresh** `POST /auth/refresh`: validates the cookie token against the latest session in the family. If valid: issues a new access token + new refresh, rotates the cookie, marks old refresh as `replaced_by`. **If the presented refresh is already `replaced_by`** (i.e. someone reused an old token), revoke EVERY session in the family AND write an `audit_log` row with severity `critical`. The client is forced to re-login.
> 6. **Logout** `POST /auth/logout`: revokes current refresh family, clears cookie.
> 7. **Magic link** `POST /auth/magic-request` + `POST /auth/magic-consume`: same single-use 15-min token in `email_token`. Issues same access+refresh pair.
> 8. **OAuth stubs:** `GET /auth/oauth/apple` and `GET /auth/oauth/google` return 501 with `{ error: { code: 'NOT_IMPLEMENTED' } }`. Routes registered so Stage 5 can wire them.
> 9. **Middleware:** `requireAuth` decorator on Fastify that validates the access JWT and attaches `req.user`. `requireVerifiedEmail` for sync endpoints.
> 10. **Tests** (`tests/integration/auth.test.ts` against real Postgres in compose):
>     - signup happy path
>     - signup with existing email → same response shape, no leak
>     - verify happy path, verify with expired token → 400
>     - login bad password → 401, after 5 attempts → 429
>     - refresh rotation: old refresh stops working, new refresh works
>     - **refresh-reuse detection: a) login, b) refresh once, c) try to use the OLD refresh again → entire family revoked, new refresh also rejected.** This is the single most important auth test.
>     - magic link round-trip
>     - email-verify required for sync endpoint (`/vault/manifest` returns 403 without it)
>
> NO production secrets in tests. Use `crypto.randomBytes(32).toString('hex')` for JWT secrets in test env.
>
> NO-SLOP FOOTER applies in full. Second-model review mandatory (§19.11).

**Definition of done:** every test above passes; `audit_log` row written on refresh-reuse; secrets out of source.

---

### Stage 3 — Prompt 3: Vault endpoints + device registry + webhook scaffolding

**Model:** **Sonnet 4.6** for endpoints/devices, **Opus 4.6** for webhook idempotency and the reconciliation race test.
**Estimated agent time:** 180 min. **Your time:** +45 min.
**Prerequisites:** Stage 3 Prompt 2.

**Prompt:**
   > Read `CLAUDE.md` §3.1b, §18.5, §20.4.
   >
   > Implement:
   >
   > 1. **`/devices`** routes — `POST` (register), `GET` (list), `DELETE /:id` (revoke). Each requires auth + verified email.
   > 2. **`/vault/manifest`** `GET` — returns `{ key_version, schema_version, latest_op_id_per_table }` so a client knows what to pull.
   > 3. **`/vault/push`** `POST` — body is `{ device_id, ops: EncryptedOp[] }`. Server validates the shape, asserts `device_id` belongs to the user, appends each op to `vault_blob`. The server NEVER inspects payload_ciphertext. Size limit 5 MB per request; reject larger with 413. Atomicity: a single SQL transaction per request.
   > 4. **`/vault/pull`** `POST` — body `{ since_op_id_per_table? }`. Returns ops newer than the cursors. Pagination: 500 ops per response, `next_cursor` returned. Server still does not inspect content.
   > 5. **Stripe webhook** `POST /webhooks/stripe`: raw-body parser (not JSON) so signature verification works. `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`. On valid event: INSERT into `webhook_event` with `ON CONFLICT (provider, external_id) DO NOTHING`; if the insert returned 0 rows, the event was already processed — return 200 without acting. Otherwise dispatch to a typed handler. Write an `audit_log` row.
   > 6. **Razorpay webhook** `POST /webhooks/razorpay`: same shape, Razorpay signature verify (HMAC-SHA256 of body with secret, constant-time compare).
   > 7. **Idempotency test (Opus pass):** simulate Stripe sending the same event twice 10ms apart — assert only one state change. Simulate a webhook arriving BEFORE the matching `/billing/checkout` callback — assert eventual consistency (next `/billing/status` poll matches). Hammer test: 200 concurrent webhook deliveries of the same id → exactly one row in `webhook_event`.
   > 8. **Audit log query:** `GET /admin/audit-log` requires admin token; returns recent rows. Protected by env `ADMIN_TOKEN`; do NOT expose without it.
   >
   > Tests in `tests/integration/vault.test.ts` and `tests/integration/webhooks.test.ts`. Use a Stripe mock (no real network).
   >
   > NO-SLOP FOOTER applies. Plus: every endpoint has a Zod input AND output schema. Drift between them is a tested error.

**Definition of done:** vault round-trip works against compose; webhooks reject bad signatures, dedupe correctly, survive the hammer test.

**After Stage 3:** push. Backend is alive locally. Pen-test it mentally — what would a hostile client try? Nothing in production yet.
DONEEEEEEEEEEEEEEEEEEEEEEE
---

## 13. v2.0 — STAGE 4: SYNC ENGINE

**Stage goal:** the desktop app actually pushes ciphertext to the backend, pulls ciphertext, merges locally, surfaces conflicts. Recovery phrase works.

**Stage duration estimate at 3–4 h/day:** 14–18 days.

### Stage 4 — Prompt 1: Sync protocol doc + vector clocks + push

**Model:** **Opus 4.6.**
**Estimated agent time:** 180 min. **Your time:** +60 min.
**Prerequisites:** Stage 3 done.

**Prompt:**
> Write `docs/sync-protocol.md` as your FIRST act. Cover: op-log shape, per-record vector clocks (`{ deviceId: version }`), push request/response, pull request/response, conflict detection rule (concurrent if neither vector clock dominates the other), conflict resolution policy (last-write-wins by wall clock for non-concurrent; concurrent → both retained as `conflict` until UI resolves), device-id stability, the "wrong key, fail loudly" rule, error codes.
>
> Then implement push in `apps/desktop/electron/services/sync/`:
>
> 1. `push.ts`: read `sync_queue` ordered by `created_at`, batch up to 200 ops, encrypt EACH op with the data key (using `table:record_id` as AD), `POST /vault/push`. On 200 ack, delete those rows from `sync_queue`. On 401, refresh access token via cookie and retry once; on still 401, surface a "session expired, please log in" toast.
> 2. `clock.ts`: in-memory vector-clock cache keyed by `(table, record_id)`. Hydrated on app start by querying max(version) grouped by record across all syncable tables.
> 3. `runner.ts`: leaky-bucket scheduled run every 60 s; also runs on window focus; also exposes a manual `cairn.sync.now()` IPC.
> 4. Failure handling: any 5xx → exponential backoff with jitter, capped at 5 min. Any 4xx other than 401 → toast, do not retry until next manual run.
> 5. Tests: encrypt-then-roundtrip-to-API; AD-binding test (an op encrypted with `trades:abc` must not decrypt under `trades:def`); rate-limit-respect test.
>
> NO record actually encrypted in the UI flow yet — the push pulls from `sync_queue` which currently has 0 rows in real installs. That's fine. Next prompt wires the actual encryption-on-write.
>
> NO-SLOP FOOTER applies in full. §19.11 second-model review mandatory.

**Definition of done:** `docs/sync-protocol.md` written; push module exists with tests; `cairn.sync.now()` IPC available; the API server logs only ciphertext when triggered with seeded queue data.

---

### Stage 4 — Prompt 2: Encryption-on-write + pull + merge

**Model:** **Opus 4.6.**
**Estimated agent time:** 240 min, two sessions. **Your time:** +90 min.
**Prerequisites:** Stage 4 Prompt 1.

**Prompt:**
> Read `docs/sync-protocol.md` and `apps/desktop/electron/services/sync/push.ts`.
>
> 1. **Encryption-on-write:** every IPC handler that mutates a syncable row, AFTER the DB commit, also: (a) serializes the row to canonical JSON (sorted keys, integer fields explicit), (b) encrypts it with the data key (Stage 2 module), (c) appends to `sync_queue`. Use a single helper `enqueueSyncOp(table, record_id, op_type, plaintext_row)` so each IPC handler is a one-liner. The helper is the ONLY way to enqueue.
> 2. **Pull:** `pull.ts` calls `/vault/pull` with the cursor, receives ops, decrypts each (AD = `table:record_id`), validates the Zod schema for that table, applies to local SQLite inside ONE transaction per pull response. Schema-validation failure → quarantine the op in `apps/desktop/electron/db/sync-quarantine` table + audit-log entry; do NOT silently discard.
> 3. **Merge / conflict detection:** for each pulled op, compare vector clock vs local vector clock:
>    - Local is ancestor → apply.
>    - Pulled is ancestor → skip.
>    - Concurrent (neither dominates) → write BOTH versions into a `conflict` table and surface in the UI (next prompt builds the modal).
> 4. **Runner update:** the 60-s tick now alternates push then pull. On focus, do both.
> 5. **Tests:**
>    - **Two-device offline edit simulation.** Spin up two in-memory SQLite DBs that share an encrypted server (in-process). Edit trade `T` on device A. Edit trade `T` on device B. Both go online. Sync. Assert: conflict row exists in both DBs.
>    - **Linear edit:** edit on A, sync. Then edit on B which pulled first. No conflict. B sees A's change.
>    - **Wrong AD attack:** craft a row whose AD doesn't match. Decrypt fails. Op is quarantined.
>    - **Server cannot decrypt:** in a test, get the raw bytes the server stored and assert that without the data key, no `decryptRecord` call succeeds.
>
> NO-SLOP FOOTER applies in full. §19.11 review mandatory.

**Definition of done:** every test passes; the server cannot decrypt; quarantine table works; the runner is steady.

---

### Stage 4 — Prompt 3: Device enrollment, conflict UI, recovery phrase

**Model:** **Opus 4.6** for the enrollment + recovery cryptography; **Sonnet 4.6** for the conflict UI.
**Estimated agent time:** 240 min, two sessions. **Your time:** +75 min.
**Prerequisites:** Stage 4 Prompt 2.

**Prompt:**
> 1. **First-login enrollment:** when a user signs in on a fresh desktop, prompt for password → derive KEK via Argon2id with params from `/vault/manifest` → fetch wrapped data key from server → unwrap → cache in OS keychain (`apps/desktop/electron/services/keychain.ts`). Register the device. Upload no data yet.
> 2. **Subsequent launches:** keychain entry present → unwrap is a no-op (already unwrapped). Missing → re-prompt for password.
> 3. **Recovery phrase flow:**
>    - On signup, generate a 24-word phrase (Stage 2 module). Show it ONCE with a forced acknowledgement: a typed confirmation `I have written this down` (gated like an override per §2.2).
>    - Add `/auth/forgot-password` and a "Restore from recovery phrase" flow that asks for the phrase, derives an alternate KEK, unwraps the data key, sets a new password, re-wraps with the new KEK, uploads the new wrapped key.
>    - Add a test: write a known phrase + password, lose the password, recover via phrase, assert vault decrypts.
> 4. **Conflict UI:** a modal in `apps/desktop/src/features/sync/conflict-resolver.tsx`. For each row in the `conflict` table, show both versions diffed by field; the user picks one or merges manually. Resolving writes a new row with both vector-clock heads as parents (so the conflict ends).
> 5. **Settings → Sync:** a panel showing sync state (last successful push/pull timestamps), enrolled devices, "Revoke device" action, "Sync now," and a prominent "Reveal recovery phrase" requiring password re-entry.
>
> Critical: never show the recovery phrase in logs, in screenshots, in clipboard history without explicit user action. Disable Windows clipboard history for the recovery-phrase field via input attributes / focus management.
>
> NO-SLOP FOOTER applies in full. Second-model review mandatory.

**Definition of done:** new desktop install can sign in, sync, see data; recovery phrase recovers a vault when password is lost (tested); conflicts surface in UI and resolve cleanly.

**After Stage 4:** push. The product is now a syncing cloud-backed desktop app, but only with mock billing and no web. Take time off; manually test on two real machines.


---

## 14. v2.0 — STAGE 5: WEB APP

**Stage goal:** the same React UI runs in a browser, authenticated, with end-to-end-encrypted sync. No new feature work — pure transport refactor + web shell + security hardening.

**Stage duration estimate at 3–4 h/day:** 10–14 days.

### Stage 5 — Prompt 1: Transport abstraction + IPC refactor

**Model:** Sonnet 4.6.
**Estimated agent time:** 180 min, two sessions. **Your time:** +45 min.
**Prerequisites:** Stage 4 done.

**Prompt:**
> Read `CLAUDE.md` §3.6, §3.7, §18.7.
>
> 1. **Define `Transport` interface** in `packages/shared-types/src/transport.ts` per §3.6.
> 2. **`ElectronTransport`** in `apps/desktop/src/lib/transport-electron.ts`: forwards calls over the existing IPC.
> 3. **Refactor every UI call site** in `apps/desktop/src/features/**` and `apps/desktop/src/components/**` to depend on the `Transport` interface only. The `Procedures` map (the typed catalog of `name → { input, output }`) lives in `packages/shared-zod/src/procedures.ts` so it can be shared with the server later.
> 4. **Boundary:** `cairn.ipc.invoke(name, payload)` (the existing preload bridge) is now called by `ElectronTransport` only. Nothing else may touch `window.cairn.ipc.*` directly. ESLint rule `no-restricted-syntax` to enforce.
> 5. **Tests:** every `Procedures` entry has a Zod schema for input and output; a vitest contract test asserts `apps/desktop/electron/ipc/*` handler signatures match.
>
> NO-SLOP FOOTER applies. No behavioural change should be visible to the user — every feature still works the same on desktop.

**Definition of done:** transport abstraction landed; no direct IPC calls outside the transport; tests green.

---

### Stage 5 — Prompt 2: HttpTransport + web shell + auth screens

**Model:** Sonnet 4.6; escalate to **Opus 4.6** for the cookie / CSP / CSRF middleware decisions.
**Estimated agent time:** 240 min, two-three sessions. **Your time:** +60 min.
**Prerequisites:** Stage 5 Prompt 1.

**Prompt:**
> Read `CLAUDE.md` §3.1c, §18.7, and `docs/security.md`.
>
> 1. **`apps/web/`** workspace: Vite + React + TypeScript strict. Imports the shared features from `apps/desktop/src/features/**`. (Configure tsconfig paths + Vite alias.)
> 2. **`HttpTransport`** in `apps/web/src/lib/transport-http.ts`: `fetch` with credentials, automatic refresh on 401 (single in-flight refresh promise — don't dogpile), maps server `{ ok, error.code }` to the same Result shape the renderer already expects.
> 3. **Auth screens:** login, signup, email-verify, forgot-password, magic-link consume, OAuth callback (501 page), recovery-phrase prompt on first sign-in.
> 4. **Client-side decryption:** vault data fetched via HttpTransport is ciphertext; the crypto module from Stage 2 (now exposed via `packages/shared-crypto/` — extract it from `apps/desktop/electron/services/crypto/` to a package) decrypts in-browser, caches in IndexedDB (Dexie). Plaintext never leaves the browser.
> 5. **Service Worker:** offline read of the IndexedDB-cached vault only. NO offline writes (would conflict with sync model).
> 6. **Security:**
>    - **CSP:** strict, with nonces injected at HTML render time. No `unsafe-inline`. No `unsafe-eval`.
>    - **SRI** on every external script (there should be ~0 of these; bundle everything).
>    - **Cookies:** access token NEVER in a cookie — kept in memory only. Refresh token in `__Host-refresh` cookie, `SameSite=Strict`, `Secure`, `HttpOnly`.
>    - **CSRF:** because access token isn't a cookie and CORS is strict allowlist, the standard CSRF surface is closed; double-submit token on `/auth/refresh` for belt-and-braces.
>    - **Memory hygiene:** zero out key bytes on logout (use `sodium.memzero`).
> 7. **"Cairn Pro required" gate:** when free user tries to use the web app, show the upgrade screen with the entitlement model spelled out (free = desktop-only, pro = web + sync).
> 8. **Tests:** Playwright e2e covers `signup → verify → recovery-phrase save → sync → multi-device-conflict (two browser contexts)`. Run in CI.
>
> NO behavioural feature change vs desktop. NO new functionality. Web and desktop must show the same numbers.
>
> NO-SLOP FOOTER applies in full. Second-model review for cookies, CSP, refresh logic.

**Definition of done:** `pnpm --filter @cairn/web dev` boots; signup → verify → login → see seeded vault works; CSP errors zero in the browser console; Playwright e2e passes.

**After Stage 5:** push. Deploy a preview web app behind a password gate (Cloudflare Access or Vercel preview password) so only you and trusted testers see it before launch. Two real-device test pass for a week.

---

## 15. v2.0 — STAGE 6: BILLING & SUBSCRIPTIONS

**Stage goal:** wire Stripe + Razorpay end-to-end. Single source of entitlement truth. Grace period state machine. No spaghetti.

**Stage duration estimate at 3–4 h/day:** 12–16 days.

### Stage 6 — Prompt 1: BillingProvider interface + Stripe implementation

**Model:** **Opus 4.6.** Every word in §20 of CLAUDE.md applies.
**Estimated agent time:** 240 min, two sessions. **Your time:** +75 min.
**Prerequisites:** Stage 5 done.

**Prompt:**
> Read `CLAUDE.md` §2.14, §3.1d, §18.8, §20 (every subsection).
>
> 1. **`packages/billing-types/`** — `Plan`, `Feature`, `PlanSnapshot`, `Entitlement`, `WebhookEvent`, `CreateCustomerInput`, etc. Plan/feature matrix in `packages/billing-types/src/plans.ts` per §20.3.
> 2. **`apps/server/src/billing/provider.ts`** — the `BillingProvider` interface per §20.2.
> 3. **`apps/server/src/billing/stripe.ts`** — `StripeBillingProvider`. Uses the Stripe SDK. Implements `createCustomer`, `createCheckout`, `openPortal`, `cancelSubscription`, `verifyWebhook`. Subscription events translated to internal `WebhookEvent` shape.
> 4. **Webhook handler updated** (built in Stage 3) to dispatch through `BillingProvider.verifyWebhook` + a per-event-type handler that mutates `subscription` table inside a transaction and writes an `audit_log` row.
> 5. **`EntitlementService`** in `apps/server/src/billing/entitlement-service.ts` per §20.1. Reads from `subscription`. Caches in Redis (Upstash) with a 60-s TTL, with a Redis-pub-sub invalidation on webhook receipt for immediate consistency.
> 6. **Sync endpoint gating:** `/vault/push` and `/vault/pull` now `await entitlements.canUse(userId, 'cloud_sync')`; if false → `402 Payment Required` with payload `{ code: 'UPGRADE_REQUIRED', upgrade_url }`.
> 7. **State machine** per §20.5 — explicit transitions only; every illegal transition throws `ILLEGAL_STATE` and writes `audit_log`.
> 8. **Stripe Tax:** enable in dashboard, use checkout `automatic_tax: { enabled: true }`. Document tax-code mapping in `docs/billing.md`.
> 9. **Tests** (`tests/integration/billing-stripe.test.ts`):
>    - signup → start checkout → mocked-webhook `customer.subscription.created` → `subscription` row is `trial`.
>    - trial → `invoice.paid` → `active`.
>    - `invoice.payment_failed` → `past_due`.
>    - `invoice.paid` after past_due → `active`.
>    - 14 days in `past_due` (advance the clock) → `canceled`.
>    - `customer.subscription.deleted` mid-period → `canceled` (effective period_end).
>    - Refund webhook → entitlement revoked immediately.
>    - **Signature mismatch → 400 + no DB write.** This is the most important security test.
>    - **Replay (same webhook id twice) → exactly one DB write.**
>    - **Race: webhook arrives before checkout-success callback → reconciliation works.**
>
> Write `docs/billing.md` with: plan matrix, grace period (3-day soft, 14-day hard), state diagram, how to add a new provider (template referencing Stage 6 Prompt 2's Razorpay impl as the worked example).
>
> NO-SLOP FOOTER applies in full. Second-model review for the webhook + state machine.

**Definition of done:** Stripe test mode end-to-end works locally with `stripe-cli` listening; all tests pass; entitlement gate proven on `/vault/push`.

---

### Stage 6 — Prompt 2: Razorpay implementation + checkout/portal UI

**Model:** **Opus 4.6** for Razorpay + GST; Sonnet 4.6 for the checkout UI.
**Estimated agent time:** 210 min. **Your time:** +60 min.
**Prerequisites:** Stage 6 Prompt 1.

**Prompt:**
> Read `docs/billing.md` (just written) and Razorpay's subscription docs.
>
> 1. **`apps/server/src/billing/razorpay.ts`** — `RazorpayBillingProvider` implementing the same interface. Razorpay's webhook signature is HMAC-SHA256 over the raw body. Subscription model is slightly different (subscription + plan + customer); map to internal `WebhookEvent` consistently.
> 2. **GST handling:** Razorpay collects GST. Document the IN-specific plan price (inclusive vs exclusive of GST) in `docs/billing.md`. The plan_id in the matrix is the same, the regional gateway is selected by user's country at checkout time.
> 3. **Country routing:** new endpoint `POST /billing/checkout` accepts `{ country, plan_id, interval }`. If `country === 'IN'`, route to Razorpay; else Stripe. The choice is stored on the resulting `subscription` row.
> 4. **Customer Portal:** `/billing/portal` returns a URL — Stripe Customer Portal for Stripe customers; Razorpay-hosted invoices/cancel page for Razorpay customers.
> 5. **Frontend (web + desktop):**
>    - **Pricing page:** two plans (free + pro), monthly + annual toggle. Localized to INR for IN, USD elsewhere (Geo via Cloudflare header on web; a country dropdown on desktop).
>    - **Upgrade modal** triggered by `/vault/push` 402 response. Honest copy explaining the trade-off (sync = paid, local = free forever).
>    - **Settings → Billing:** subscription state, next billing date, "Open billing portal," "Cancel."
> 6. **Tests** mirror the Stripe ones; signature mismatch and replay tests are mandatory.
> 7. **Free → Trial → Active flow:** when a user starts checkout, immediately create a `subscription` row in `trial` state with `trial_ends_at = now + 14 days` and `provider_subscription_id = null` (filled by webhook). This lets the user use Pro features during the redirect to checkout without race conditions.
>
> NO-SLOP FOOTER applies in full.

**Definition of done:** Razorpay test mode works locally; IN user goes Razorpay, others Stripe; portal links resolve; tests green.

**After Stage 6:** push. The product is now monetizable. Run a closed beta — invite 5–10 paying trusted users at a discounted lifetime price (one-time, to validate the funnel without committing to a price). Sit with the funnel for two weeks; iterate.

---

## 16. v2.0 — STAGE 7: PRODUCTION HARDENING & LAUNCH

**Stage goal:** safe to put in front of strangers in 30 countries. Threat model, ASVS, Sentry, OTel, backups, code signing, status page, soft launch.

**Stage duration estimate at 3–4 h/day:** 14–18 days.

### Stage 7 — Prompt 1: Threat model + ASVS L2 + dependency hardening

**Model:** **Opus 4.6.**
**Estimated agent time:** 240 min, two-three sessions. **Your time:** +120 min (you read every word).
**Prerequisites:** Stage 6 done.

**Prompt:**
> Read `CLAUDE.md` §2.13, §18.9, §19.7, §19.8.
>
> 1. **`docs/threat-model.md`:** assets (vault, password hash, payment data, sync log, recovery phrase), trust boundaries, attackers (curious admin, network attacker, malicious browser tab, stolen device, compromised dependency, hostile co-tenant in the hosting platform), STRIDE per component, **mitigations matrix mapped to code paths**. No "TODO." If something isn't mitigated, that's a separate row called Outstanding with an owner and a deadline.
> 2. **`docs/asvs-checklist.md`:** OWASP ASVS Level 2 row-by-row. Each row → Done / N/A / Outstanding with a link to the code or doc that proves it. Build this as a markdown table; do not hand-wave any row.
> 3. **CI security:** add jobs to `.github/workflows/ci.yml` for `gitleaks`, `trivy fs .`, `trivy image`, `npm audit --production --audit-level=high`. High/critical findings block merge.
> 4. **Dependency review:** add `socket.dev` GitHub app (free tier) for supply-chain alerts; configure to block PRs introducing risky deps.
> 5. **CSP final pass on web:** verify zero report-only violations during a full Playwright run. If any, fix the source, do not relax the policy.
> 6. **Run a real pen-test pass yourself:** use `zap-baseline.py` against the staging API in CI; fix anything red.
>
> NO-SLOP FOOTER applies. Plus: a second-model review of the threat-model.md by a fresh Opus session is mandatory.

**Definition of done:** both docs exist with no TODO; CI security jobs green; ZAP baseline clean.

---

### Stage 7 — Prompt 2: Observability, backups, DR runbook

**Model:** Sonnet 4.6.
**Estimated agent time:** 180 min. **Your time:** +45 min.
**Prerequisites:** Stage 7 Prompt 1.

**Prompt:**
> 1. **Sentry:** server-side always-on with PII scrubbing (use `Sentry.captureException` with `beforeSend` to redact); client-side gated on opt-in (default false), with the user's email salted-and-hashed before being attached as `user.id` so support can correlate without seeing the address.
> 2. **OpenTelemetry:** `@opentelemetry/sdk-node` on the API. Spans from incoming request → Drizzle queries → outbound webhooks/email. Exporter to either Grafana Tempo Cloud (free tier) or Honeycomb (free tier). Service name `cairn-api`. Sampling: head-based 10 % for healthy traffic, 100 % for 5xx and slow requests.
> 3. **Metrics:** OTel meter for: requests-per-second per route, latency p95 per route, sync-push-ops-per-minute, webhook-receive-rate per provider, signup-funnel counters.
> 4. **Grafana dashboards** as JSON under `ops/dashboards/`: API health, auth funnel, sync throughput, webhook lag, billing state distribution.
> 5. **Daily backup-verify GitHub Action** (`.github/workflows/backup-verify.yml`): pulls the most recent Supabase/Neon PITR snapshot into a scratch DB, runs migrations forward, runs a query that asserts a known row count is non-zero. Fails loudly if anything misbehaves. Run for three consecutive days before declaring §16.b #47 met.
> 6. **`docs/runbook.md`:** paging policy (none for the solo dev — but a clear severity scale), P1/P2/P3 examples, rollback procedure (Drizzle migrations + deploy revert), KEK rotation procedure, GDPR / DPDP data-export procedure (Akash runs the script, the user receives an export ZIP), data-deletion procedure (90-day retention then crypto-shred by deleting wrapped data key).
>
> NO-SLOP FOOTER applies. Telemetry must be opt-in on the client; verify with a test that disables and asserts no network calls.

**Definition of done:** Sentry shows errors when seeded; OTel shows spans in the chosen vendor; backup-verify job has run green 3 consecutive nights; `docs/runbook.md` exists with no TODO.

---

### Stage 7 — Prompt 3: Code signing + release pipeline + launch checklist

**Model:** Sonnet 4.6.
**Estimated agent time:** 180 min. **Your time:** +60 min (most of it dealing with code-signing-certificate paperwork outside the chat).
**Prerequisites:** Stage 7 Prompt 2.

**Prompt:**
> 1. **Windows code-signing:** integrate signtool into electron-builder. The EV cert procurement is Akash's offline task — the prompt sets up the wiring so that when the cert is supplied, the build signs automatically. Document the cert procurement process in `docs/runbook.md`.
> 2. **macOS notarization:** `electron-builder` `notarize: true` with `notarytool`. Apple Developer account, app-specific password in env, signed + notarized DMG.
> 3. **Linux:** AppImage with `--no-sandbox` warning disabled cleanly.
> 4. **Release workflow** `.github/workflows/release.yml`: triggered by a `v*.*.*` tag, builds desktop for all three platforms, uploads signed artefacts to a draft GitHub Release, attaches SHA-256 checksums.
> 5. **Launch checklist** `docs/launch-checklist.md`: 30 items covering legal (privacy policy, ToS, DPA, cookie banner, subprocessor list, Article 30 records), product (pricing live, refund policy live, support email live, status page at `status.cairn.app`), tech (Sentry production, OTel production, backup verify green 3 days), comms (changelog, blog announcement, X/HN/Reddit-ready post).
> 6. **Soft launch plan:** invite-only access list of ~50 traders, two-week stability window, daily-stand-up-with-myself note template, public launch trigger condition (`< 0.1 % 5xx rate over the window AND no critical bugs open`).
>
> NO-SLOP FOOTER applies.

**Definition of done:** all three platforms produce signed builds in CI; launch checklist exists with no TODO; soft-launch invite list ready.

**After Stage 7:** Cairn is launchable. Run the soft launch. Two weeks of stability + < 0.1 % 5xx → flip public.


---

## 17. TIMELINE SUMMARY (at 3–4 h/day, solo, Claude Pro)

These are honest planning estimates including review + smoke-test time, not just agent time. Round up, never down.

### v1.2 — Friction reduction & free parity (local-only, zero infra cost)

| Wave | Prompts | Working days | Wall-clock weeks |
|---|---|---|---|
| Wave 0 — Foundation | 4 | 4 | ~1 |
| Wave 1 — Friction quick-wins | 6 | 10 | ~2 |
| Wave 2 — Automations | 7 | 14 | ~3 |
| Wave 3 — Import + two-phase logging | 6 | 18 | ~4 |
| **v1.2 total** | **23** | **~46** | **~10 weeks** (≈ 2.5 months) |

### Wave 4 — Live broker integration (optional; MT5 EA bridge + cTrader Open API)

| Wave | Prompts | Working days | Wall-clock weeks |
|---|---|---|---|
| Wave 4 — Live broker (MT5 + cTrader) | 6 | ~16 | ~3.5 |

Wave 4 is **not** part of "v1.2 done" and is sequenced separately (before, after, or instead of the v2.0 cloud rebuild). It carries external-dependency slack: an MT5 demo terminal to test the EA against, and a Spotware Open API app registration + OAuth review for cTrader. Spec: `docs/broker-integration.md`; prompts: §8.7.

### v2.0 — Cloud, sync, billing, web (paid infra activates here)

| Stage | Prompts | Working days | Wall-clock weeks |
|---|---|---|---|
| Stage 0 — Quality baseline | 2 | 3 | <1 |
| Stage 1 — v1.1 audit + decimal sweep | 1 | 5 | ~1 |
| Stage 2 — Sync-ready model + crypto | 2 | 10 | ~2 |
| Stage 3 — Backend core | 3 | 16 | ~3.5 |
| Stage 4 — Sync engine | 3 | 16 | ~3.5 |
| Stage 5 — Web app | 2 | 12 | ~2.5 |
| Stage 6 — Billing & subscriptions | 2 | 14 | ~3 |
| Stage 7 — Hardening & launch | 3 | 16 | ~3.5 |
| **v2.0 total** | **18** | **~92** | **~20 weeks** (≈ 4.5 months) |

### Grand total

**~7 months of solo work at 3–4 h/day.**

Add **1 month of slack** for: real-life interruptions (1 week), one wave/stage where the spec is wrong and you discover it during implementation (1 week), one external dependency stalling you (Apple Developer ID, EV cert, payment-provider review for Razorpay India) (2 weeks).

**Realistic ship date for v1.2 done:** ~early August 2026.
**Realistic ship date for v2.0 done + soft launch:** ~late February 2027.
**Realistic public launch:** ~mid March 2027.

If you can get to 6 h/day, halve the wall-clock. If you can stay at 8 h/day, halve it again — but at that pace, the bottleneck stops being you and starts being review time. Do not skip review to hit a date.

### Tagging strategy (do this religiously)

- After Wave 0: tag `v1.2-wave0`.
- After each Wave: `v1.2-waveN-<short-descriptor>`.
- After v1.2 done: `v1.2.0`.
- After each v2.0 Stage: `v2.0-stageN-<short>`.
- After v2.0 done, before soft launch: `v2.0.0-rc.1`.
- After soft launch with no critical bugs in two weeks: `v2.0.0`.

Tags make `git bisect` realistic. They also make rollbacks safe.

---

## 18. WHEN THINGS BREAK — DEBUG PROMPTS

For when you ship a feature, push, walk away, come back later and something is wrong. These are model-agnostic recipes; pick the smallest model that can handle the task.

### Debug Prompt — "Tests started failing after commit X"

> The CI on commit `<sha>` is red. Most recent passing commit was `<sha>`. Read the diff between those two commits. Run `pnpm test` locally and capture the output. Triage every failing test: is the test wrong (assertion no longer matches reality) or is the code wrong (regression)? Fix in the smallest possible patch. Do NOT mark any test `.skip` or `.todo`. Do NOT comment a test out. If you cannot fix it in this session, STOP and report the blocker — do not push a yellow workaround.

**Model:** Sonnet 4.6 normally; Opus 4.6 if the test is in `crypto/`, `billing/`, `sync/`, or `pnl-calculator.ts`.

### Debug Prompt — "Migration is failing on a real user's DB"

> User reports the app crashes on launch after auto-update with the message `<error>`. The relevant migration is `apps/desktop/electron/db/migrations/<N>.sql`. Read the migration. Reason about what state a user DB might be i