/**
 * Symbol → pairId resolution shared by all import adapters.
 * Pure functions — no DB access; the caller loads the pairs list.
 */

import type { ImportCandidate } from '../../../../shared/types/index'

/** Build an UPPERCASE symbol → pairId lookup map from the pairs table. */
export function buildSymbolMap(
  pairs: ReadonlyArray<{ id: string; symbol: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const p of pairs) {
    map.set(p.symbol.toUpperCase(), p.id)
  }
  return map
}

/**
 * Resolve pairId for each candidate using the auto-map and optional user overrides.
 *
 * Candidates with no matching pairId are returned with `pairId: null`; their
 * symbols are collected in `unresolved` (deduplicated).
 *
 * @param candidates  Adapter output; all should have `pairId: null` on entry.
 * @param autoMap     Built from buildSymbolMap() over the local pairs table.
 * @param userMap     User-provided symbol → pairId overrides (from symbolMap input).
 */
export function resolvePairIds(
  candidates: ImportCandidate[],
  autoMap: Map<string, string>,
  userMap: Record<string, string>,
): { resolved: ImportCandidate[]; unresolved: string[] } {
  const unresolved: string[] = []
  const seen = new Set<string>()

  const resolved = candidates.map((c) => {
    const upper = c.symbol.toUpperCase()
    const pairId = autoMap.get(upper) ?? userMap[upper] ?? userMap[c.symbol] ?? null
    if (!pairId && !seen.has(c.symbol)) {
      unresolved.push(c.symbol)
      seen.add(c.symbol)
    }
    return { ...c, pairId }
  })

  return { resolved, unresolved }
}
