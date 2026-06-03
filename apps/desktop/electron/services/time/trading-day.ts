import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { CairnDb } from '../../db/index'

/**
 * The single, canonical definition of a "trading day" for Cairn.
 *
 * Every per-day bucket in the app MUST go through this module so the calendar,
 * the daily-trade-limit rule, the max-daily-loss circuit breaker, and the
 * session date key all agree on which calendar day a timestamp belongs to.
 * Bucketing happens in the user's *configured* timezone (default
 * America/New_York), not UTC — a trade placed at 22:00 New York time on the
 * 20th belongs to the 20th even though it is already the 21st in UTC.
 *
 * Implementation notes:
 *   - Day boundaries are computed via `Intl.DateTimeFormat`, so they are
 *     DST-correct (the offset is resolved per-instant, never hard-coded).
 *   - Killzone / weekend logic intentionally stays UTC (see rules-engine
 *     `helpers.ts`): killzones are stored as UTC wall-clock times. Only the
 *     *day bucket* is timezone-aware.
 */

export const DEFAULT_TIME_ZONE = 'America/New_York'

const SECOND_MS = 1000
const HOUR_MS = 60 * 60 * SECOND_MS

/** Validates an IANA timezone id by attempting to construct a formatter. */
function isValidTimeZone(timeZone: string): boolean {
  try {
    // Throws RangeError for an unknown timezone.
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Reads the user's configured timezone from the `settings` table.
 *
 * The value may be stored either as a raw string (`America/New_York`) or as a
 * JSON-encoded string (`"America/New_York"`, or `""` for "unset") depending on
 * the write path, so both shapes are accepted. Falls back to
 * {@link DEFAULT_TIME_ZONE} when unset, blank, malformed, or unknown.
 */
export function getConfiguredTimeZone(db: CairnDb): string {
  let raw: string | undefined
  try {
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'timezone')).get()
    raw = row?.value
  } catch {
    return DEFAULT_TIME_ZONE
  }
  if (raw == null) return DEFAULT_TIME_ZONE

  let value = raw
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'string') value = parsed
  } catch {
    // `raw` is a plain (non-JSON) string — use it as-is.
  }

  value = value.trim()
  if (!value || !isValidTimeZone(value)) return DEFAULT_TIME_ZONE
  return value
}

interface ZonedParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number
  second: number
}

/** Wall-clock calendar parts of `utcMs` as observed in `timeZone`. */
function zonedParts(utcMs: number, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    return part ? Number(part.value) : 0
  }
  let hour = read('hour')
  // Some ICU builds emit "24" for midnight under h23; normalise to 0.
  if (hour === 24) hour = 0
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  }
}

/**
 * Offset in ms such that `localWallClock = utc + offset` at the given instant.
 * East of UTC is positive; America/New_York is negative (e.g. -4h in EDT).
 */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const p = zonedParts(utcMs, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // formatToParts truncates sub-second precision, so compare at second
  // granularity (offsets are always whole minutes).
  const utcFloor = Math.floor(utcMs / SECOND_MS) * SECOND_MS
  return asUtc - utcFloor
}

/** `YYYY-MM-DD` for the local calendar day containing `ts` in `timeZone`. */
export function tradingDayKey(ts: number, timeZone: string): string {
  const p = zonedParts(ts, timeZone)
  const mm = String(p.month).padStart(2, '0')
  const dd = String(p.day).padStart(2, '0')
  return `${p.year}-${mm}-${dd}`
}

/** Epoch ms of local midnight starting the day that contains `ts`. */
export function tradingDayStart(ts: number, timeZone: string): number {
  const p = zonedParts(ts, timeZone)
  // Local midnight expressed as if the wall clock were UTC.
  const wallMidnightAsUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0)
  const offset = tzOffsetMs(wallMidnightAsUtc, timeZone)
  let result = wallMidnightAsUtc - offset
  // Re-resolve the offset at the candidate instant to correct for DST edges
  // (the offset at midnight-UTC can differ from the offset at local midnight).
  const refinedOffset = tzOffsetMs(result, timeZone)
  if (refinedOffset !== offset) {
    result = wallMidnightAsUtc - refinedOffset
  }
  return result
}

/**
 * Epoch ms of the next local midnight after the day that contains `ts`
 * (i.e. the exclusive end of the local day). DST-safe: adding 26h then
 * snapping back to local midnight always lands on the following day even when
 * the day is 23h or 25h long.
 */
export function tradingDayEnd(ts: number, timeZone: string): number {
  const start = tradingDayStart(ts, timeZone)
  return tradingDayStart(start + 26 * HOUR_MS, timeZone)
}
