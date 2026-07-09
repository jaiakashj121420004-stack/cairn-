/**
 * Guardrail-degraded signaling.
 *
 * Rule configuration (`account_rules.value`) is user-editable JSON. If it is
 * ever malformed, the engine must never just quietly fall back to "rule off"
 * with nothing but a code comment — a silently-disabled safety rule is the
 * worst failure class this app can ship (CLAUDE.md §2.3 / §2.12). On a parse
 * failure this module reports the failure through a single sink so the main
 * process can log it (electron-log) and push a `guardrail.degraded` event to
 * every window, which `GuardrailBanner` (src/features/system) turns into a
 * persistent warning pointing at Settings.
 *
 * Kept dependency-free of `electron`/`electron-log` — unlike the composition
 * root in `services/broker/index.ts` or `services/sync/activate.ts` — so the
 * rules engine (engine.ts, close-detection.ts, live-detection.ts) stays
 * directly unit-testable under vitest with no Electron runtime. The real sink
 * is wired once at startup via {@link setGuardrailSink} (electron/main.ts),
 * mirroring the `broadcast()` / `notify()` pattern those services use.
 */

export interface GuardrailDegradedPayload {
  /** The account-rule key whose configuration failed to parse. */
  readonly ruleKey: string
  /** Short, human-debuggable reason — never includes secrets/PII. */
  readonly reason: string
}

export type GuardrailSink = (payload: GuardrailDegradedPayload) => void

let sink: GuardrailSink = () => {}

/** Wired once by the main-process bootstrap. Safe to leave unset (no-op) in tests. */
export function setGuardrailSink(fn: GuardrailSink): void {
  sink = fn
}

/** Restore the no-op sink. Tests call this in `afterEach` to avoid leaking a spy. */
export function resetGuardrailSink(): void {
  sink = () => {}
}

/**
 * Report that a safety rule's stored configuration could not be parsed and the
 * rule is therefore not being enforced this cycle. Never throws — the caller
 * continues without the parsed config (treating it as absent), it just does so
 * loudly instead of silently.
 */
export function reportGuardrailDegraded(ruleKey: string, reason: string): void {
  try {
    sink({ ruleKey, reason })
  } catch {
    // The sink itself must never be able to break rule evaluation.
  }
}

/**
 * Parse a rule's JSON config, reporting (never throwing) on failure.
 *
 * `site` is a short machine-readable tag identifying the call-site (e.g.
 * `checkAndLockSession:max_daily_loss_pct`) folded into the reported reason so
 * the log line / banner trail says WHERE the malformed config was hit.
 */
export function parseRuleConfig<T = unknown>(raw: string, ruleKey: string, site: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    reportGuardrailDegraded(ruleKey, `invalid JSON config at ${site}: ${message}`)
    return null
  }
}
