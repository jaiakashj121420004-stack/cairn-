## 6.5 v1.2 — WAVE 1.5: REMEDIATION (run before Wave 2)

> Paste this whole section into `prompts.md` between the end of Wave 1
> (right after the "After Wave 1:" line) and the "## 7. v1.2 — WAVE 2: AUTOMATIONS" header.
> Also update the Wave 1 closing line to:
> **After Wave 1:** push, take a half day off, manually click through every flow you just touched. **Do NOT start Wave 2 until the Wave 1.5 remediation below is green.**

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
