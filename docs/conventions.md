> Split from CLAUDE.md — Section 13: CONVENTIONS

## 13. CONVENTIONS

### 13.1 Code Style

- Prettier for formatting (config committed).
- ESLint with strict TypeScript rules.
- No `any`. If unavoidable, `unknown` + zod validation.
- No default exports except React components (single per file).

### 13.2 Naming

- Files: kebab-case (`trade-entry-panel.tsx`).
- Components: PascalCase (`TradeEntryPanel`).
- Hooks: camelCase starting with `use` (`useActiveAccount`).
- DB columns: snake_case (`entry_price`).
- TypeScript types/interfaces: PascalCase (`TradeDraft`).
- Enums: PascalCase values or string-literal unions (prefer unions).

### 13.3 Commits

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`).
- Imperative mood, lowercase, no period.
- Reference feature in body when non-trivial.

### 13.4 Branching

- `main` = stable.
- Feature branches: `feat/<short-name>`.
- No direct commits to main except for trivial fixes.

### 13.5 Git Hooks

- Pre-commit: `lint-staged` runs Prettier + ESLint on changed files.
- Pre-push: `pnpm typecheck` and `pnpm test:unit`.

### 13.6 Environment

- No `.env` secrets needed for v1 (everything local).
- `.env.example` committed with any non-secret defaults.
- Platform-specific paths resolved via Node `path` + Electron `app.getPath()`.

### 13.7 Error Handling

- Every IPC returns `{ ok, data } | { ok, error }`.
- Errors include: `code`, `message`, optional `details`.
- User-facing errors: plain English, never stack traces.
- Unexpected errors in main process: logged to `<data>/logs/` and surfaced in Settings > About > Diagnostics.

### 13.8 Logging

- `electron-log` for main process.
- Log levels: error, warn, info, debug.
- Rotated daily, max 7 days retained.
- Accessible via Settings for copy/export.

### 13.9 Performance Budgets

- Cold app launch → dashboard interactive: <1500ms.
- New trade panel open: <120ms.
- Analytics tab switch: <400ms with 1000+ trades.
- Rule evaluation on field change: <30ms.
- SQLite writes for trade submit: <50ms.

### 13.10 Accessibility

- Keyboard navigation for all interactive elements.
- Focus visible indicators (custom-styled, never removed).
- ARIA roles/labels for complex components.
- Color contrast ≥ 4.5:1 for body, 3:1 for UI elements.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Text resizable up to 150% without layout break.

### 13.11 Self-Healing / Self-Correcting Practices

Specific requirements Claude Code must implement:

1. **Database integrity check on launch.** Run `PRAGMA integrity_check`. If fails, attempt backup restore prompt.
2. **Pending migration detection.** If DB schema version < code expected, run migrations with snapshot backup first.
3. **Crash log capture.** Uncaught main-process errors write to a crash log with app state summary.
4. **Auto-backup before risky operations.** Before migrations, data reset, bulk imports (v2), an auto-backup runs.
5. **Settings schema validation on load.** Settings are zod-validated; invalid values reset to defaults with a toast notification.
6. **Orphaned file cleanup.** On launch, check `screenshots/` for files with no corresponding trade and move them to `screenshots/_orphaned/`.
7. **Duplicate prevention.** Trade submit checks for near-duplicate (same account, same pair, same direction, entry within 1 pip, within last 5 min) and warns.
8. **Stale lock recovery.** If a cooldown has `expires_at` in the past but `cleared_at` is null on launch, auto-clear it.
9. **Timezone change handling.** If OS timezone changes, app detects on next launch, warns user, offers to update session date boundaries.
10. **Version mismatch guard.** On launch, compare app version with the version that last wrote the DB. Downgrades are blocked with a clear message (upgrades are fine).
11. **Transaction wrappers.** All multi-row writes (trade + violations + screenshots) are wrapped in a single SQLite transaction.
12. **Idempotent IPC.** Create operations accept optional client-generated IDs so retries don't duplicate.

### 13.12 Development Mindset for Claude Code

Instructions for the agent implementing this spec:

- **Build vertically, not horizontally.** Complete one feature end-to-end (data model → IPC → UI → tests) before starting another. This ensures each shipped feature actually works.
- **Order of build (suggested):**
  1. Project scaffold (Electron + React + Vite + TS + Tailwind + shadcn/ui init).
  2. Database setup with drizzle + first migration + seed.
  3. IPC plumbing with one sample domain (settings).
  4. Design system primitives (colors, fonts, base components).
  5. Shell UI (sidebar, top bar, dark/light toggle, attribution).
  6. Onboarding.
  7. Accounts + templates + prop firms CRUD.
  8. Pairs/setups/killzones CRUD.
  9. Session bias entry.
  10. Rules engine core + built-in rules.
  11. New trade pre-trade panel.
  12. Post-trade log + trade detail.
  13. Trade log (history view).
  14. Dashboard.
  15. Analytics (tab by tab).
  16. Settings (tab by tab).
  17. Backup/restore.
  18. Self-healing utilities.
  19. Polish, animations, accessibility pass.
  20. Testing passes.
- **Never skip the rules engine.** It is the heart of the app. If an early feature needs it, stub it properly; do not shortcut it.
- **When in doubt, re-read §1 and §2.** The philosophy and non-negotiables resolve most design choices.
- **If a conflict appears between this spec and another instruction, this spec wins.** Surface the conflict to the user rather than silently resolving.
- **Ship small commits.** Every commit should leave the app runnable.
- **Write real tests for the rules engine and calculators before writing UI that depends on them.**
- **Before adding any library not listed in §3.1, pause and justify.** The stack is already chosen; additions dilute it.
