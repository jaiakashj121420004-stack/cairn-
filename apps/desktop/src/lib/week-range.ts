// Local week-boundary helper for the data-backed weekly review (P3). Pure and
// deterministic: given a reference date and the user's week-start preference, it
// returns the [start, end] of that week in LOCAL time, plus local ISO date
// strings for the review form. Local (not UTC) so "this week" matches what the
// trader sees on a wall clock.

export interface WeekRange {
  /** Local start-of-week (inclusive), epoch ms. */
  start: number
  /** Local end-of-week (inclusive, 23:59:59.999), epoch ms. */
  end: number
  /** Local YYYY-MM-DD of the week start. */
  startIso: string
  /** Local YYYY-MM-DD of the week end. */
  endIso: string
}

/** 1 = week starts Monday, 0 = week starts Sunday. */
export type WeekStartsOn = 0 | 1

function toLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The local week boundaries for the week containing `ref`, shifted by
 * `offsetWeeks` (0 = that week, -1 = the previous week, +1 = next).
 */
export function getWeekRange(ref: Date, weekStartsOn: WeekStartsOn, offsetWeeks = 0): WeekRange {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const day = start.getDay() // 0=Sun … 6=Sat
  const back = weekStartsOn === 1 ? (day === 0 ? 6 : day - 1) : day
  start.setDate(start.getDate() - back + offsetWeeks * 7)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return {
    start: start.getTime(),
    end: end.getTime(),
    startIso: toLocalIso(start),
    endIso: toLocalIso(end),
  }
}
