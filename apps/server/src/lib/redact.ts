/**
 * Deep PII/secret redaction for telemetry payloads (CLAUDE.md §2.13, §18.9).
 *
 * `logger.ts` redacts pino log lines via path-based rules, but Sentry events carry
 * arbitrary nested objects (request bodies, breadcrumbs, extra context) whose shapes
 * aren't known up front. This walks any value and replaces every key that matches
 * {@link SENSITIVE_KEYS} with `[redacted]`, regardless of nesting depth.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'pepper',
  'ciphertext',
  'email',
  'authorization',
  'cookie',
  'datakey',
  'recoveryphrase',
  'phrase',
  'dek',
  'kek',
])

const REDACTED = '[redacted]'

/** Returns true if `key` (case-insensitive) names a value that must never leave the device. */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

/**
 * Deep-clone `value`, replacing any object property whose key matches
 * {@link SENSITIVE_KEYS} with `[redacted]`. Handles arrays and nested objects;
 * guards against circular references. Non-plain values (Date, Error, etc.) pass
 * through `String()` rather than risk leaking enumerable internals.
 */
export function redactDeep<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== 'object') return value

  if (seen.has(value as object)) return '[circular]' as unknown as T
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, seen)) as unknown as T
  }

  if (value instanceof Date || value instanceof Error) {
    return value
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactDeep(val, seen)
  }
  return out as T
}
