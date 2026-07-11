/**
 * Pure computation for the pre-trade psychology nudges (P3 breadth; CLAUDE.md
 * §2.1 prevention, §2.11 configurability). These surface calm, mentor-voice
 * advisories in the New Trade panel BEFORE the click — an early warning when the
 * trader is statistically in a risky state. They are NON-blocking: the rules
 * engine remains the only thing that blocks a trade.
 *
 * All logic here is deterministic and account-local (no LLM, no network) — it
 * runs on the same trade history the retrospective insights use, but answers a
 * point-in-time question instead of a historical one.
 */

import type { PreTradeNudgeConfig, PreTradeSignals } from '../../../shared/types/index'

/** Minimal closed-trade shape the signals need. `pnlR` is R×100 (integer-encoded). */
export interface PreTradeSignalTrade {
  /** R × 100; null when the trade has no recorded result. */
  pnlR: number | null
  /** Pre-trade urgency the trader logged (1–10). */
  preUrgencyScore: number
  /** Close time (UTC ms) — used only to order the streak scan. */
  exitTime: number
}

/** Sensible defaults when the `pretrade_nudges` setting is unset or malformed. */
export const DEFAULT_PRETRADE_NUDGES: PreTradeNudgeConfig = {
  tilt: { enabled: true, lossRun: 3 },
  urgency: { enabled: true, level: 7 },
}

/** Each urgency bucket needs at least this many trades before the split is shown. */
const MIN_URGENCY_BUCKET = 10
/** The low−high win-rate gap (percentage points) that makes the urgency check "material". */
const MIN_URGENCY_DELTA_PP = 10

/** Guardrails so a malformed stored value can never produce an absurd threshold. */
const LOSS_RUN_MIN = 2
const LOSS_RUN_MAX = 20
const URGENCY_LEVEL_MIN = 1
const URGENCY_LEVEL_MAX = 10

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Parse the `pretrade_nudges` setting value (a JSON string) into a validated
 * config, falling back to {@link DEFAULT_PRETRADE_NUDGES} for any missing or
 * malformed field. Pure and total — never throws.
 */
export function parsePreTradeNudgeConfig(raw: string | null | undefined): PreTradeNudgeConfig {
  if (raw == null) return DEFAULT_PRETRADE_NUDGES
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return DEFAULT_PRETRADE_NUDGES
  }
  if (typeof obj !== 'object' || obj === null) return DEFAULT_PRETRADE_NUDGES

  const o = obj as { tilt?: unknown; urgency?: unknown }
  const tilt = (typeof o.tilt === 'object' && o.tilt !== null ? o.tilt : {}) as {
    enabled?: unknown
    lossRun?: unknown
  }
  const urgency = (typeof o.urgency === 'object' && o.urgency !== null ? o.urgency : {}) as {
    enabled?: unknown
    level?: unknown
  }

  return {
    tilt: {
      enabled:
        typeof tilt.enabled === 'boolean' ? tilt.enabled : DEFAULT_PRETRADE_NUDGES.tilt.enabled,
      lossRun: clampInt(
        tilt.lossRun,
        LOSS_RUN_MIN,
        LOSS_RUN_MAX,
        DEFAULT_PRETRADE_NUDGES.tilt.lossRun,
      ),
    },
    urgency: {
      enabled:
        typeof urgency.enabled === 'boolean'
          ? urgency.enabled
          : DEFAULT_PRETRADE_NUDGES.urgency.enabled,
      level: clampInt(
        urgency.level,
        URGENCY_LEVEL_MIN,
        URGENCY_LEVEL_MAX,
        DEFAULT_PRETRADE_NUDGES.urgency.level,
      ),
    },
  }
}

/**
 * Current consecutive-loss streak: scan the account's closed trades newest-first
 * and count losses until the first non-loss. A trade with no recorded result
 * (`pnlR == null`) ends the run — an unknown outcome is not a loss.
 */
export function currentLossStreak(trades: PreTradeSignalTrade[]): number {
  const sorted = [...trades].sort((a, b) => b.exitTime - a.exitTime)
  let streak = 0
  for (const t of sorted) {
    if (t.pnlR == null) break
    if (t.pnlR < 0) streak++
    else break
  }
  return streak
}

/**
 * Split win-rate by urgency around `level`: low = urgency < level, high =
 * urgency ≥ level. `sufficient` is true only when both buckets are large enough
 * AND the low−high gap is material, so the nudge never fires on thin data.
 */
export function urgencySplit(
  trades: PreTradeSignalTrade[],
  level: number,
): {
  lowWinRatePct: number
  highWinRatePct: number
  lowSample: number
  highSample: number
  sufficient: boolean
} {
  const low = trades.filter((t) => t.preUrgencyScore < level)
  const high = trades.filter((t) => t.preUrgencyScore >= level)
  const winRate = (bucket: PreTradeSignalTrade[]): number =>
    bucket.length === 0
      ? 0
      : Math.round((bucket.filter((t) => (t.pnlR ?? 0) > 0).length / bucket.length) * 100)

  const lowWinRatePct = winRate(low)
  const highWinRatePct = winRate(high)
  const sufficient =
    low.length >= MIN_URGENCY_BUCKET &&
    high.length >= MIN_URGENCY_BUCKET &&
    lowWinRatePct - highWinRatePct > MIN_URGENCY_DELTA_PP

  return {
    lowWinRatePct,
    highWinRatePct,
    lowSample: low.length,
    highSample: high.length,
    sufficient,
  }
}

/** Assemble the point-in-time signals for the New Trade panel. */
export function computePreTradeSignals(
  trades: PreTradeSignalTrade[],
  config: PreTradeNudgeConfig,
): PreTradeSignals {
  const split = urgencySplit(trades, config.urgency.level)
  return {
    tilt: {
      enabled: config.tilt.enabled,
      lossRun: config.tilt.lossRun,
      currentLossStreak: currentLossStreak(trades),
    },
    urgency: {
      enabled: config.urgency.enabled,
      level: config.urgency.level,
      ...split,
    },
  }
}
