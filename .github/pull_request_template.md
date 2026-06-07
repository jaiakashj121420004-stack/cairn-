<!--
  Cairn PR template. The checklist below is the "No-Slop" review gate
  (CLAUDE.md §2.12, §19, locked in §14 #25). Do not delete rows — tick them or
  mark N/A with a one-line reason. A PR cannot merge from a single voice (§19.11).
-->

## What & why

<!-- One paragraph: what this PR changes and which CLAUDE.md section / doc / issue it serves. -->

## How tested

<!-- Commands run, manual smoke steps, screenshots if UI. -->

---

## No-Slop checklist (§19)

### Type safety (§19.1)

- [ ] TypeScript strict; no new `any`. `unknown` + type guards where a type is genuinely open.
- [ ] No `// @ts-ignore`. Any `// @ts-expect-error` has a reason and a linked issue.
- [ ] Untyped third-party libs are wrapped in a `.d.ts`, not papered over with `any`.

### Boundaries & validation (§19.2)

- [ ] Every new IPC handler / HTTP route / disk parser validates input with a Zod schema from `packages/shared-zod/`.
- [ ] DB read-back results are explicitly typed, not inferred to a wide shape.

### Async & errors (§19.3, §19.4)

- [ ] No floating promises (`await` or explicit `void` with a comment).
- [ ] Cross-boundary calls return `Result<T>`; errors map to a code in `error-codes.ts`.
- [ ] No empty/`console.log`-only catch blocks.

### Money & time (§19.5)

- [ ] Money / pips use decimal types, never `number` floats.
- [ ] Timestamps are UTC (`Date`/ms); timezone is display-only at the UI layer.

### Migrations (§19.6)

- [ ] New migrations are append-only, idempotent, and have a forward (and where applicable backward) test.

### Dependencies & secrets (§19.7, §19.8)

- [ ] New deps pinned to exact versions; no GPL/AGPL transitives (`pnpm check-licenses`).
- [ ] No secrets in source; `.env.example` updated for any new env var.

### Logging (§19.9)

- [ ] No `console.log` in production code (pino on server, electron-log on client).
- [ ] No PII / tokens / ciphertext logged.

### Tests & coverage (§19.10, §19.13)

- [ ] New public surfaces have tests; critical surfaces (crypto, P&L, rules, sync, billing) have property-based tests.
- [ ] `pnpm typecheck`, `pnpm lint --max-warnings 0`, `pnpm test:unit`, and `pnpm format:check` all pass.
- [ ] Coverage gate met or raised (never lowered).

### Review (§19.11)

- [ ] Reviewed by a human or a Claude Opus code-review pass (not self-merged).
- [ ] Docs in `docs/` updated where behavior or architecture changed.
