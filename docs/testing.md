> Split from CLAUDE.md — Section 12: TESTING

## 12. TESTING

### 12.1 Philosophy

Test the things that would be expensive to get wrong. Money math, rules engine, and data integrity are the priority. UI polish can be covered by manual QA.

### 12.2 Unit Tests (Vitest)

**Required coverage:**
- All calculators (`lib/calculators.ts`): lot size, pip value, R-multiple, RR, P&L.
- Rules engine: each rule has isolated tests with multiple scenarios.
- Formatters: money, pips, percentages, locale handling.
- Database utilities.

**Target:** >90% coverage on `lib/`, `services/`, `rules-engine/`.

### 12.3 Integration Tests

- IPC round-trips with real SQLite.
- Migration runs successfully on fresh and existing DBs.
- Backup creates valid zip; restore recreates identical state.

### 12.4 E2E Tests (Playwright, Electron)

**Critical paths:**
- First-launch onboarding completes.
- New trade: happy path.
- New trade: rule-blocked path.
- Trade close + journal entry.
- Dashboard reflects new trade.
- Theme switch persists.
- Backup creation and restore.

### 12.5 Manual QA Checklist (Pre-release)

Documented checklist covering:
- All forms validate correctly.
- All rules trigger at correct thresholds.
- All animations respect reduced-motion.
- Dark/light both render correctly.
- Accessibility basics: focus order, ARIA labels, keyboard nav.
