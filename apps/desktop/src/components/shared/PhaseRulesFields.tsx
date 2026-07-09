import type { CreateAccountPhaseInput, DrawdownType } from '@shared/types/index'
import { Input } from '../ui'

/**
 * Shared per-phase rules editor (onboarding StepTemplate, Accounts create/edit,
 * Settings → Templates) — one component so the three surfaces cannot drift.
 *
 * Values are held as percent strings while typing and converted to integer
 * basis points on submit via {@link phaseRowsToInputs} (§2.5 — never floats in
 * storage). Editing Phase 1 flows into later phases the user has not touched
 * yet; a later phase becomes independent the moment it is edited.
 */
export interface PhaseFieldsRow {
  /** Percent as typed (e.g. "8" for 8%). Empty or 0 = no target (funded phase). */
  profitTargetPctStr: string
  dailyDrawdownPctStr: string
  totalDrawdownPctStr: string
  /** Per-field edit flags — an untouched later phase keeps mirroring phase 1. */
  touched: { target: boolean; daily: boolean; total: boolean }
}

type PhaseField = 'target' | 'daily' | 'total'

export function blankPhaseRow(seed?: {
  target?: string
  daily?: string
  total?: string
}): PhaseFieldsRow {
  return {
    profitTargetPctStr: seed?.target ?? '10',
    dailyDrawdownPctStr: seed?.daily ?? '5',
    totalDrawdownPctStr: seed?.total ?? '10',
    touched: { target: false, daily: false, total: false },
  }
}

/**
 * Display label for phase `phaseNumber` of a `total`-phase ladder. The terminal
 * phase of a 3+-step ladder (two or more evaluation phases + funded) is
 * labeled "Funded"; shorter ladders stay plain "Phase n".
 */
export function phaseLabel(phaseNumber: number, total: number): string {
  return total >= 3 && phaseNumber === total ? 'Funded' : `Phase ${phaseNumber}`
}

/** Grow (cloning phase 1's current values, untouched) or shrink to `count` rows (1..5). */
export function resizePhaseRows(rows: PhaseFieldsRow[], count: number): PhaseFieldsRow[] {
  const n = Math.max(1, Math.min(5, count))
  if (n <= rows.length) return rows.slice(0, n)
  const first = rows[0] ?? blankPhaseRow()
  const grown = [...rows]
  while (grown.length < n) {
    grown.push({
      profitTargetPctStr: first.profitTargetPctStr,
      dailyDrawdownPctStr: first.dailyDrawdownPctStr,
      totalDrawdownPctStr: first.totalDrawdownPctStr,
      touched: { target: false, daily: false, total: false },
    })
  }
  return grown
}

/** Build editor rows from persisted per-phase values (bps → percent strings, all touched). */
export function rowsFromPhases(
  phases: ReadonlyArray<{
    profitTargetPct: number | null
    dailyDrawdownValue: number
    totalDrawdownValue: number
  }>,
): PhaseFieldsRow[] {
  return phases.map((p) => ({
    profitTargetPctStr: p.profitTargetPct === null ? '' : String(p.profitTargetPct / 100),
    dailyDrawdownPctStr: String(p.dailyDrawdownValue / 100),
    totalDrawdownPctStr: String(p.totalDrawdownValue / 100),
    touched: { target: true, daily: true, total: true },
  }))
}

/**
 * Convert editor rows to per-phase inputs (percent → integer basis points).
 * Empty/0 profit target becomes null (no target — typical for a funded phase);
 * drawdowns must be positive. Returns a per-field error message on bad input.
 */
export function phaseRowsToInputs(
  rows: PhaseFieldsRow[],
  dailyDrawdownType: DrawdownType,
  totalDrawdownType: DrawdownType,
): { ok: true; phases: CreateAccountPhaseInput[] } | { ok: false; error: string } {
  const phases: CreateAccountPhaseInput[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const label = phaseLabel(i + 1, rows.length)
    const target = row.profitTargetPctStr.trim() === '' ? 0 : Number(row.profitTargetPctStr)
    const daily = Number(row.dailyDrawdownPctStr)
    const total = Number(row.totalDrawdownPctStr)
    if (!Number.isFinite(target) || target < 0) {
      return { ok: false, error: `${label}: profit target must be 0 or more.` }
    }
    if (!Number.isFinite(daily) || daily <= 0) {
      return { ok: false, error: `${label}: daily drawdown must be greater than 0.` }
    }
    if (!Number.isFinite(total) || total <= 0) {
      return { ok: false, error: `${label}: total drawdown must be greater than 0.` }
    }
    phases.push({
      phaseNumber: i + 1,
      profitTargetPct: target > 0 ? Math.round(target * 100) : null,
      dailyDrawdownType,
      dailyDrawdownValue: Math.round(daily * 100),
      totalDrawdownType,
      totalDrawdownValue: Math.round(total * 100),
    })
  }
  return { ok: true, phases }
}

function withField(r: PhaseFieldsRow, field: PhaseField, value: string): PhaseFieldsRow {
  switch (field) {
    case 'target':
      return { ...r, profitTargetPctStr: value }
    case 'daily':
      return { ...r, dailyDrawdownPctStr: value }
    case 'total':
      return { ...r, totalDrawdownPctStr: value }
    default:
      return r
  }
}

interface PhaseRulesFieldsProps {
  rows: PhaseFieldsRow[]
  onChange: (rows: PhaseFieldsRow[]) => void
  /** Show per-row remove + a trailing "Add phase" control (min 1, max 5). */
  editableCount?: boolean
  /** Prefix for input ids so multiple instances stay unique in the DOM. */
  idPrefix?: string
}

export function PhaseRulesFields({
  rows,
  onChange,
  editableCount = false,
  idPrefix = 'phase',
}: PhaseRulesFieldsProps) {
  function setField(index: number, field: PhaseField, value: string) {
    onChange(
      rows.map((r, i) => {
        if (i === index) {
          const next = withField(r, field, value)
          return index > 0 ? { ...next, touched: { ...next.touched, [field]: true } } : next
        }
        // Phase 1 edits flow into later phases the user has not touched yet.
        if (index === 0 && i > 0 && !r.touched[field]) return withField(r, field, value)
        return r
      }),
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div
          key={`${idPrefix}-${i}`}
          className="rounded-[10px] border border-border bg-surface-elevated/50 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-caption font-medium text-text-secondary">
              {phaseLabel(i + 1, rows.length)}
            </p>
            {editableCount && rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-caption text-text-muted underline-offset-2 hover:text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              id={`${idPrefix}-${i}-target`}
              label="Profit target (%)"
              type="number"
              numeric
              value={row.profitTargetPctStr}
              onChange={(e) => setField(i, 'target', e.target.value)}
              hint="0 = no target"
            />
            <Input
              id={`${idPrefix}-${i}-daily`}
              label="Daily DD (%)"
              type="number"
              numeric
              value={row.dailyDrawdownPctStr}
              onChange={(e) => setField(i, 'daily', e.target.value)}
            />
            <Input
              id={`${idPrefix}-${i}-total`}
              label="Total DD (%)"
              type="number"
              numeric
              value={row.totalDrawdownPctStr}
              onChange={(e) => setField(i, 'total', e.target.value)}
            />
          </div>
        </div>
      ))}
      {editableCount && rows.length < 5 && (
        <button
          type="button"
          onClick={() => onChange(resizePhaseRows(rows, rows.length + 1))}
          className="text-caption text-text-secondary underline-offset-2 hover:underline"
        >
          Add phase
        </button>
      )}
    </div>
  )
}
