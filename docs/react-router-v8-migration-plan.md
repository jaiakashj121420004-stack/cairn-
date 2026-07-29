# React Router v8 migration plan (Node 22 + React 19 + Vite 7 bundled)

**Status: NOT STARTED. Deferred by explicit decision on 2026-07-29** — see CLAUDE.md §17.6 "Current status" and `docs/build-status.md`'s 2026-07-29 entries for how this was discovered. This file is the source of truth for doing it properly in a dedicated session. Read this whole file before touching any code.

## 0. Why this exists

`pnpm audit --prod --audit-level high` (run in both `ci.yml`'s Dependency Audit job and `security.yml`'s dep-audit job) flags 2 high-severity advisories in `react-router` (pulled in transitively via `react-router-dom`):

- [GHSA-chx6-hx7r-mcp5](https://github.com/advisories/GHSA-chx6-hx7r-mcp5) — Unauthenticated DoS via inefficient route matching. Fixed in react-router ≥7.18.0.
- [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) — RSC Mode CSRF bypass allows action execution before a 400 response. Fixed in react-router ≥8.3.0.

The second advisory is only patched at ≥8.3.0 — there is no 7.x patch for it. Full remediation means moving to react-router v8, not just bumping the 7.x patch version.

**Severity in plain terms:** the DoS issue means a crafted URL could make route-matching slow, not a data breach. The CSRF bypass is scoped to "RSC Mode," a newer React Server Components integration this app does not use (this is a client-only Electron/SPA app, no RSC). Neither is a "someone steals trading data or money" bug — this is why it was judged safe to defer rather than rush.

**Decision on 2026-07-29:** do the full upgrade, but in its own dedicated session with real testing time, not bundled into an unrelated CI-fix session. This document is the handoff.

## 1. The real scope — this is NOT a 28-file import rename

React Router v8 has hard prerequisites, confirmed directly against the npm registry (`curl https://registry.npmjs.org/react-router/8.3.0`), not a blog post:

```
engines:          { node: ">=22.22.0" }
peerDependencies: { react: ">=19.2.7", react-dom: ">=19.2.7" }
```

React Router's own release notes additionally state a **Vite ≥7** baseline for the v8 line. So "upgrade react-router" actually chains into:

1. **Node 20 → 22.22+** — this repo's `.nvmrc` pins `20`, referenced by every CI workflow's `setup-node` step (`node-version-file: .nvmrc`) and the root `package.json`'s `engines.node: ">=20.0.0"`. One upside already discovered: `apps/server/Dockerfile` is **already** on `node:22-slim` for both its `deps` and `runtime` stages — the server container has been ahead of the rest of the repo on this axis the whole time, so Node 22 is not an unknown quantity here.
2. **React 18.3.1 → 19.2.7+** — its own breaking-change surface (see §3 below), in both `apps/desktop` and `apps/web`.
3. **Vite 5.4.0 (desktop, via `electron-vite@2.3.0`) → 7+, and Vite 6.0.5 (web) → 7+** — check `electron-vite`'s own changelog for Vite-7 compatibility before picking a target version; it may need its own bump in lockstep.
4. **`react-router-dom` → `react-router` (package removed)** — v8 deletes the `react-router-dom` package entirely. Confirmed from React Router's own upgrade guide (`https://reactrouter.com/upgrading/v7`) as of 2026-07-29: `RouterProvider`/`HydratedRouter` move to `react-router/dom`; "everything else" moves to `react-router`. **Do not trust that split from memory** — re-read `https://reactrouter.com/upgrading/v7` live in the new session, since docs may have been refined between now and then, and get the definitive per-export list before touching imports. In particular, verify where `BrowserRouter`, `NavLink`, `MemoryRouter` land — this repo uses all three and they're DOM-rendering/DOM-test utilities, so they most likely join `RouterProvider` in `react-router/dom`, but confirm against the real docs rather than assuming.
5. Possible knock-on check: **`@testing-library/react`** is already at `^16.3.2` in both apps, which generally already supports React 19 — likely fine as-is, but confirm rather than assume.

Given this chain, treat it as one coordinated toolchain bump (Node + React + Vite + router), not an isolated dependency patch. Recommend doing it on its own branch (e.g. `chore/node22-react19-router8`) off `feat/rules-engine`, verified fully green, then merged — so it can be reviewed or rolled back as one unit if something regresses, independent of whatever else is in flight on `feat/rules-engine` at the time.

## 2. Every file that touches `react-router-dom` today (grep'd 2026-07-29 — re-verify, don't trust this list blindly if time has passed)

**`apps/web`** (uses the classic `<BrowserRouter>` + `<Routes>/<Route>` wrapper pattern):
- `src/main.tsx` — `import { BrowserRouter } from 'react-router-dom'`
- `src/App.tsx` — `import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'`
- `src/components/UpgradeModal.tsx` — `useNavigate`
- `src/screens/VerifyEmail.tsx` — `useNavigate, useSearchParams`
- `src/screens/VaultUnlock.tsx` — `useNavigate`
- `src/screens/SyncHome.tsx` — `useNavigate`
- `src/screens/BillingReturn.tsx` — `useNavigate`
- `src/screens/MagicConsume.tsx` — `useNavigate, useSearchParams`
- `src/screens/Signup.tsx` — `useNavigate`
- `src/screens/Billing.tsx` — `useNavigate`
- `src/screens/Login.tsx` — `useNavigate`
- `src/screens/ResetPassword.tsx` — `useNavigate, useSearchParams`
- `src/screens/Home.tsx` — `Navigate`
- `src/screens/RecoveryPhrasePrompt.tsx` — `useNavigate`

**`apps/desktop`** (uses a **data router** — `createHashRouter` + `<RouterProvider>`, not the classic wrapper pattern; this is the more consequential half of the migration since `RouterProvider` is confirmed to move to `react-router/dom`):
- `src/router.tsx` — `import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'`
- `src/components/layout/Shell.tsx` — `Outlet, useLocation`
- `src/components/layout/Sidebar.tsx` — `NavLink`
- `src/components/layout/TopBar.tsx` — `NavLink`
- `src/features/command-palette/CommandPalette.tsx` — `useNavigate`
- `src/features/command-palette/registry.ts` — `import type { NavigateFunction }`
- `src/features/notebook/NotebookPage.tsx` — `useSearchParams`
- `src/features/trade-log/TradeLogPage.tsx` — `useSearchParams`
- `src/features/dashboard/CalendarWidget.tsx` — `useNavigate`
- `src/features/analytics/AnalyticsPage.tsx` — `useSearchParams`
- `src/features/analytics/tabs/CalendarTab.tsx` — `useNavigate`
- `src/hooks/useKeyboardShortcuts.ts` — `useNavigate`
- `tests/unit/analytics/calendar/CalendarTab.test.tsx` — `MemoryRouter`
- `tests/unit/notebook/NotebookPage.test.tsx` — `MemoryRouter`

Plus the two `package.json` dependency declarations (`apps/desktop/package.json:59`, `apps/web/package.json:39`), both currently `"react-router-dom": "^7.17.0"`.

Re-run this search before starting, don't trust it's still complete: `grep -rn "from ['\"]react-router-dom['\"]" --include="*.ts" --include="*.tsx" apps/`.

## 3. React 18 → 19 — things to specifically check for in this codebase

Don't assume any of these apply — grep for them and confirm, but they're the known v19 breaking-change surface worth ruling out explicitly:

- `defaultProps` on function components — removed in React 19. `grep -rn "defaultProps" apps/desktop/src apps/web/src`.
- Legacy string refs (`ref="someName"`) — removed. Should already be absent if the codebase uses TypeScript + modern patterns, but confirm.
- `ReactDOM.render` / `ReactDOM.hydrate` — removed (already deprecated since 18; confirm both apps' entry points use `createRoot`/`hydrateRoot`. `apps/web/src/main.tsx` is the one to check first).
- `PropTypes` usage on function components — no longer validated by React itself.
- Any `forwardRef`-wrapped component that also needs updating to the new "ref as a normal prop" pattern — not required (old `forwardRef` components keep working), but worth knowing this is now available if any refactor is convenient mid-migration. Do not scope-creep into rewriting these unless necessary.

## 4. React Router v8 "future flags now default" — behavioral, not just import-path

React Router v8 makes several previously-opt-in v7 future-flags the *default* behavior. Re-confirm the current list at `https://reactrouter.com/upgrading/v7` (may have grown), but as of this doc:
- Trailing-slash-aware data fetching.
- Route middleware pipeline enabled by default.
- Route module splitting on by default.

None of these are pure import-path changes — they can alter how existing routes actually match/behave. After the import rewrite, manually walk every route in both apps (see §6 checklist) rather than assuming "it compiled, so it works."

## 5. Step-by-step plan

1. **Branch.** Cut `chore/node22-react19-router8` from the tip of `feat/rules-engine`.
2. **Re-read the live docs first**, in this order, since guidance may have shifted since 2026-07-29: React Router's `https://reactrouter.com/upgrading/v7`, React's official 19 upgrade guide, Vite 7's migration guide, and `electron-vite`'s changelog for Vite 7 support. Do not proceed from memory or from this document's summaries alone — verify against the live source first.
3. **Node.** Bump `.nvmrc` to the current Node 22.x (or newer LTS if one has since shipped — check what's actually Active LTS at the time this runs) and root `package.json`'s `engines.node`. This alone cascades to every CI workflow automatically (`node-version-file: .nvmrc`) — but grep the whole repo for any other hardcoded Node-version reference first (`grep -rn "node.*20\|:20-" --include="*.yml" --include="Dockerfile" .`) so nothing is missed. `apps/server/Dockerfile` is already on `node:22-slim` — no change needed there, but re-verify it's still aligned once the rest of the repo catches up.
4. **React.** Bump `react`/`react-dom` to `^19.2.7` (or current latest 19.x) in both `apps/desktop/package.json` and `apps/web/package.json`. Run the §3 checklist.
5. **Vite / electron-vite.** Bump both apps' Vite to whatever the then-current 7.x is, and `electron-vite` to whatever version supports it. Expect some Vite config surface to have changed between major versions — check both `apps/desktop`'s and `apps/web`'s `vite.config.ts` against Vite 7's migration notes.
6. **React Router.** Remove `react-router-dom` from both `package.json`s; add `react-router` (`^8.3.0`+) instead. Rewrite every import in the §2 file list per the *live-verified* `react-router` vs `react-router/dom` split from step 2. Pay special attention to `apps/desktop/src/router.tsx` (the data router setup) — this is the highest-risk single file in the migration.
7. **Regenerate the lockfile.** If working from this same Cowork sandbox environment, `pnpm install --no-frozen-lockfile` run directly inside the mounted repo directory (not a `/tmp` copy) will crash partway through on a sandbox-only `EPERM` at pnpm's store hardlink-check step — **this is expected and does not mean the lockfile write failed.** pnpm writes the fully-resolved `pnpm-lock.yaml` *before* it reaches that crash point. Verify by diffing (`git diff --text -- pnpm-lock.yaml` — this repo's `.gitattributes` marks the lockfile `-diff`, so `--text` is required to see a real diff) and re-running `pnpm install --frozen-lockfile` against the result, which should then pass the config-mismatch check cleanly (proceeding to the same harmless sandbox-only crash confirms the lockfile itself is correct). See `docs/build-status.md`'s 2026-07-29 entry and the `sandbox-stale-reads-verification` memory for the full background on this. A `/tmp` copy of just the workspace manifests can get further but will hit a **separate**, real sandbox-egress limit (`ERR_PNPM_FETCH_403` on `codeload.github.com` for at least `electron`'s `node-gyp` git-tarball dependency) — don't retry past that, it's an environment limit, not a bug to fix.
8. **Full verification — do not skip any of these:**
   - `pnpm typecheck` — must be clean, no `any`-laundering to paper over new type errors (CLAUDE.md §2.12/§19).
   - `pnpm lint --max-warnings 0`
   - `pnpm format:check`
   - `pnpm test:unit` — every existing test must still pass; the two `MemoryRouter`-using test files (§2) need their import fixed too.
   - `pnpm build`
   - `pnpm test:e2e` (Smoke E2E)
   - `pnpm audit --prod --audit-level high` — confirm both GHSA advisories are actually gone, not just that the version number changed.
   - This sandbox cannot reliably run `tsc`/`vitest` itself (confirmed repeatedly this session — broken/incomplete `node_modules` here). **All of the above must be run and confirmed by Akash on his host via `run-host-gates.ps1`** before this migration is considered done. Don't declare success from a sandbox-only check.
9. **Manual UI/UX + feature QA** (Akash's explicit requirement: UI/UX must look and behave exactly the same, every feature must keep working) — walk every route in both apps after the upgrade:
   - **apps/desktop:** Dashboard, Trade Log (including the `useSearchParams`-driven filter state), Analytics (all tabs, especially Calendar which uses `useNavigate`), Notebook, Settings (Accounts, Pairs, Playbooks, **Integrations/broker-connect UI** — MT5 + cTrader connection screens, since these live behind normal app routes even though the broker bridge itself doesn't touch react-router), Command Palette (⌘K) navigation, all keyboard-shortcut-driven navigation, sidebar/top-bar `NavLink` active-state styling.
   - **apps/web:** Login, Signup, VerifyEmail, ResetPassword, MagicConsume, RecoveryPhrasePrompt, VaultUnlock, SyncHome, Billing + BillingReturn (the Dodo/Stripe/Razorpay redirect-back flow — this is a real `useNavigate`-after-redirect path, test it for real), Home, the UpgradeModal.
   - Confirm deep-linking, browser back/forward, and (desktop) hash-routing behavior (`createHashRouter`) are unchanged — these are exactly the kind of thing the "future flags now default" behavioral changes (§4) could subtly affect.
10. **Update docs.** Once fully green and manually verified, update `docs/build-status.md` and CLAUDE.md's §17.6 headline with the outcome, and delete/archive this file's "NOT STARTED" status line.

## 6. Guardrails

- This is purely a toolchain/dependency migration. No unrelated feature work, no scope creep, in the same branch.
- Must not touch the read-only broker boundary (CLAUDE.md §14 #37) or any other locked decision — this migration is dependency-surface only.
- If anything in §8's verification list can't be made to pass cleanly, stop and surface that clearly rather than shipping a partially-green migration.
