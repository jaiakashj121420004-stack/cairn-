<!-- Extracted from CLAUDE.md (v2.0). Loaded on demand per CLAUDE.md §0/§4 — not part of the always-in-context root. -->

## 19. ENGINEERING QUALITY STANDARD — "NO SLOP"

This standard is binding. It applies to every PR, every line, every test, every doc. It is referenced by §2.12 and locked in §14 #25.

### 19.1 Type safety
- TypeScript strict mode is on in every package. `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`.
- No `any`. If a third-party library is untyped, write a `.d.ts` for it or wrap it; do not splash `any` through your own code.
- No `// @ts-ignore`. The only acceptable suppression is `// @ts-expect-error: <reason> — issue #<n>` and the issue must exist.
- `unknown` is fine; `any` is not.

### 19.2 Validation at boundaries
- Every IPC handler, every HTTP route, every reads-from-disk parser uses a Zod schema. Inputs are validated, not assumed.
- Zod schemas live in `packages/shared-zod/` so the client and server validate against the same definition.
- Outputs from the database are also typed; if a Drizzle query joins, the result type must be explicit, not inferred to a wide shape.

### 19.3 Async correctness
- No floating promises. ESLint `no-floating-promises` is on as error. Use `await` or explicit `void` with a comment.
- No `async` without an `await` inside it (or a documented reason).
- Every external call has a timeout and a retry policy or a documented reason it doesn't.

### 19.4 Errors
- Every cross-boundary call returns `Result<T>`; never throws across boundaries.
- Internal helpers may throw, but the call must be caught at the boundary and mapped to a typed error code from `packages/shared-types/src/error-codes.ts`.
- No empty `catch` blocks. No `catch (e) { console.log(e) }`. Every catch either handles, re-throws with context, or maps to a Result.

### 19.5 Money and time
- Money is `decimal.js` or `big.js`. Never `number`. Floats are banned in `apps/server/src/billing/` and `apps/desktop/electron/services/pnl-calculator.ts`.
- Time is a UTC `Date` or `number` (ms since epoch). Timezones are display-only and live at the UI layer with `date-fns-tz`.
- Two timestamps for the same event are not allowed; pick one canonical column and derive the rest.

### 19.6 Migrations
- Drizzle migrations are append-only. No editing a committed migration.
- Every migration has a forward test and (where applicable) a backward test.
- Every migration is idempotent — re-running it on the post-state must be a no-op.
- A migration that requires data backfill happens in a separate, instrumented job, not inline with the schema change, when row count > 10^5.

### 19.7 Dependencies
- All deps pinned to exact versions. No `^` or `~` in production deps.
- Renovate or Dependabot weekly; PRs auto-opened; manual review.
- `npm audit --production` runs in CI. High/critical findings block the release.
- License check rejects any GPL/AGPL transitive.
- No deprecated packages. CI fails on `npm install` warnings about deprecation.

### 19.8 Secrets
- Never in source. Never in commits. `gitleaks` runs in CI.
- All secrets via env vars or a secret manager (Doppler / 1Password / Fly secrets).
- `.env.example` lists every variable with a comment and a fake value. `.env` is gitignored.
- Server reads env once at boot, validates with Zod (`env.ts`), and throws if anything is missing or malformed.

### 19.9 Logging
- Pino on the server, electron-log on the client. JSON structured logs.
- No `console.log` in production code. ESLint rule `no-console` is on as error (with `warn` and `error` allowed in main process error handlers only).
- PII redaction is centralized: never log `password`, `token`, `secret`, `ciphertext`, raw `email` (hashed prefix only), or full `Authorization` headers.

### 19.10 Tests
- Every public function has a test. Coverage gate starts at 70 %, ratchets up.
- Critical surfaces — crypto, P&L math, rule engine, sync engine, billing — require property-based tests via `fast-check`.
- E2E covers signup → sync → conflict → cancel → resubscribe.
- Tests use real Postgres (Docker Compose) for integration; SQLite for unit. No mocking the database wholesale.

### 19.11 Reviews
- No self-merge. Either a human review or a Claude Opus code-review pass on the diff.
- A second AI pass with a fresh-context model catches blind spots from the first model. This is required on Stage 18.4, 18.5, 18.6, and 18.8.
- Review checklist lives in `.github/pull_request_template.md`.

### 19.12 Performance budgets
- Renderer cold start ≤ 1.5 s on a modern laptop.
- Trade entry submission round-trip ≤ 250 ms p95 (local).
- Sync push of 100 ops ≤ 2 s p95.
- API p95 latency ≤ 200 ms for read endpoints, ≤ 500 ms for write endpoints, measured at the edge.
- Bundle size of web app ≤ 500 KB gzipped initial.

### 19.13 What "done" means for a feature
A feature is not done until:
1. Type-checks pass.
2. Lint passes with zero warnings.
3. Unit + integration + (where applicable) e2e tests pass.
4. Coverage gate is met or raised.
5. Docs in `docs/` are updated.
6. A migration (if any) has been run on a seeded DB without error.
7. A second model has reviewed the diff (for Stages 18.4–18.8).
8. Manual smoke test against the user journey it affects.
