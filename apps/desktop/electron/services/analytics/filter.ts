import { and, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm'
import { trades } from '../../db/schema'
import type { AnalyticsFilter } from '../../../shared/types/index'

/**
 * Shared WHERE clause builder for analytics queries against `trades`.
 *
 * Always applies:
 *   - deletedAt IS NULL
 *   - status = 'closed' (unless includeAllStatuses is true — e.g. blocked-count
 *     metrics that still want to scope to an account/date range)
 *
 * Callers compose the returned fragments with drizzle's `and(...)`.
 */
export interface BuildOptions {
  includeAllStatuses?: boolean
}

export function buildTradeWhereClauses(filter: AnalyticsFilter, opts: BuildOptions = {}): SQL[] {
  const clauses: SQL[] = [isNull(trades.deletedAt)]

  if (!opts.includeAllStatuses) {
    clauses.push(eq(trades.status, 'closed'))
  }

  if (filter.accountIds !== 'all' && filter.accountIds.length > 0) {
    clauses.push(inArray(trades.accountId, filter.accountIds))
  }

  if (filter.dateFrom !== null) {
    clauses.push(gte(trades.updatedAt, filter.dateFrom))
  }
  if (filter.dateTo !== null) {
    clauses.push(lt(trades.updatedAt, filter.dateTo))
  }

  if (filter.mode !== 'all') {
    clauses.push(eq(trades.mode, filter.mode))
  }

  if (filter.pairIds.length > 0) {
    clauses.push(inArray(trades.pairId, filter.pairIds))
  }
  if (filter.setupIds.length > 0) {
    clauses.push(inArray(trades.setupId, filter.setupIds))
  }
  if (filter.killzoneIds.length > 0) {
    clauses.push(inArray(trades.killzoneId, filter.killzoneIds))
  }

  if (filter.cleanOnly) {
    clauses.push(eq(trades.isClean, 1))
  }

  return clauses
}

/**
 * Returns the previous-period [from, to) equivalent of the given filter,
 * for trend comparisons. If either bound is null, returns null.
 */
export function previousPeriodRange(filter: AnalyticsFilter): { from: number; to: number } | null {
  if (filter.dateFrom === null || filter.dateTo === null) return null
  const span = filter.dateTo - filter.dateFrom
  if (span <= 0) return null
  return { from: filter.dateFrom - span, to: filter.dateFrom }
}

/** Convenience: combine clauses into a single SQL expression. */
export function whereAll(clauses: SQL[]): SQL {
  // drizzle's and() handles empty arrays fine (returns undefined); we always have at least one.
  return and(...clauses) as SQL
}

// Re-export sql so service files can build raw fragments without a separate import.
export { sql }
