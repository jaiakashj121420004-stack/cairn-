import type { CooldownRecord, KillzoneRecord, TradeRecord } from './types'

const MINUTE_MS = 60_000

export function parseHhMm(hhmm: string): { h: number; m: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return { h, m }
}

export function minutesOfDayUtc(ts: number): number {
  const d = new Date(ts)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

export function killzoneContainsTs(kz: KillzoneRecord, ts: number): boolean {
  const start = parseHhMm(kz.startTimeUtc)
  const end = parseHhMm(kz.endTimeUtc)
  if (!start || !end) return false
  const startMin = start.h * 60 + start.m
  const endMin = end.h * 60 + end.m
  const cur = minutesOfDayUtc(ts)
  if (startMin <= endMin) {
    return cur >= startMin && cur < endMin
  }
  return cur >= startMin || cur < endMin
}

export function findEnclosingKillzone(
  killzones: KillzoneRecord[],
  ts: number,
): KillzoneRecord | null {
  for (const kz of killzones) {
    if (!kz.active) continue
    if (killzoneContainsTs(kz, ts)) return kz
  }
  return null
}

export function isWeekendUtc(ts: number): boolean {
  const day = new Date(ts).getUTCDay()
  return day === 0 || day === 6
}

export function computeConsecutiveLosses(tradesToday: TradeRecord[]): number {
  const closed = tradesToday
    .filter((t) => t.status === 'closed' && t.pnlCents !== null)
    .sort((a, b) => (a.exitTime ?? a.updatedAt) - (b.exitTime ?? b.updatedAt))
  let streak = 0
  for (let i = closed.length - 1; i >= 0; i--) {
    const t = closed[i]
    if (t && (t.pnlCents ?? 0) < 0) streak += 1
    else break
  }
  return streak
}

export function mostRecentLoss(trades: TradeRecord[]): TradeRecord | null {
  let latest: TradeRecord | null = null
  for (const t of trades) {
    if (t.status !== 'closed') continue
    if ((t.pnlCents ?? 0) >= 0) continue
    const ts = t.exitTime ?? t.updatedAt
    if (!latest || ts > (latest.exitTime ?? latest.updatedAt)) latest = t
  }
  return latest
}

export function minutesSince(tsPast: number, now: number): number {
  return Math.floor((now - tsPast) / MINUTE_MS)
}

export function sumClosedPnlCents(trades: TradeRecord[]): number {
  let sum = 0
  for (const t of trades) {
    if (t.status === 'closed' && t.pnlCents !== null) sum += t.pnlCents
  }
  return sum
}

export function activeCooldownsNow(
  cooldowns: CooldownRecord[],
  now: number,
): CooldownRecord[] {
  return cooldowns.filter((c) => c.clearedAt === null && c.expiresAt > now)
}

