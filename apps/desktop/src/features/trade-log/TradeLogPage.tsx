import { ChevronUp, ChevronDown, ChevronsUpDown, Download, Trash2, Filter, X } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  TradeListItem,
  TradeFilter,
  TradeMode,
  TradeDirection,
  TradeStatus,
} from '@shared/types/index'
import { GradeBadge } from '../../components/shared/GradeBadge'
import { Button, Badge, useToast } from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatCents, formatRMultiple, formatDate } from '../../lib/formatters'
import { ipc } from '../../lib/ipc'
import { useSessionStore } from '../../stores/session-store'
import { CloseTradeModal } from '../post-trade/CloseTradeModal'
import { TradeDetailModal } from './TradeDetailModal'

type SortKey =
  | 'createdAt'
  | 'pairSymbol'
  | 'setupName'
  | 'direction'
  | 'rrRatio'
  | 'pnlCents'
  | 'pnlR'
  | 'isClean'
  | 'durationMinutes'
  | 'status'

type SortDir = 'asc' | 'desc'

function exportCsv(trades: TradeListItem[]) {
  const headers = [
    'Date',
    'Pair',
    'Setup',
    'Direction',
    'Mode',
    'Status',
    'Entry',
    'SL',
    'TP',
    'SL pips',
    'RR',
    'Lot size',
    'Risk $',
    'Risk %',
    'P&L $',
    'P&L R',
    'P&L %',
    'Duration (min)',
    'Clean',
    'Grade',
    'Rules broken',
  ]
  const rows = trades.map((t) => [
    new Date(t.createdAt).toISOString(),
    t.pairSymbol,
    t.setupName,
    t.direction,
    t.mode,
    t.status,
    (t.entryPrice / Math.pow(10, t.pairPipDecimal + 1)).toFixed(t.pairPipDecimal),
    (t.stopLossPrice / Math.pow(10, t.pairPipDecimal + 1)).toFixed(t.pairPipDecimal),
    (t.takeProfitPrice / Math.pow(10, t.pairPipDecimal + 1)).toFixed(t.pairPipDecimal),
    (t.slPips / 10).toFixed(1),
    (t.rrRatio / 100).toFixed(2),
    (t.lotSize / 100).toFixed(2),
    (t.riskAmountCents / 100).toFixed(2),
    (t.riskPctBps / 100).toFixed(2),
    t.pnlCents !== null ? (t.pnlCents / 100).toFixed(2) : '',
    t.pnlR !== null ? (t.pnlR / 100).toFixed(2) : '',
    t.pnlPctBps !== null ? (t.pnlPctBps / 100).toFixed(2) : '',
    t.durationMinutes ?? '',
    t.isClean === 1 ? 'yes' : t.isClean === 0 ? 'no' : '',
    t.grade?.letter ?? '',
    t.rulesBroken ? JSON.parse(t.rulesBroken).join(';') : '',
  ])
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey)
    return <ChevronsUpDown className="h-3 w-3 text-text-muted" strokeWidth={1.5} />
  return sortDir === 'asc' ? (
    <ChevronUp className="h-3 w-3 text-accent-a" strokeWidth={2} />
  ) : (
    <ChevronDown className="h-3 w-3 text-accent-a" strokeWidth={2} />
  )
}

function Th({
  col,
  sortKey,
  sortDir,
  onSort,
  children,
  right,
}: {
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (col: SortKey) => void
  children: React.ReactNode
  right?: boolean
}) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-left text-caption font-medium text-text-muted cursor-pointer select-none hover:text-text-secondary whitespace-nowrap',
        right && 'text-right',
      )}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  )
}

function StatusBadge({ status }: { status: TradeStatus }) {
  const map: Record<
    TradeStatus,
    { label: string; variant: 'success' | 'warning' | 'default' | 'neutral' }
  > = {
    open: { label: 'Open', variant: 'success' },
    closed: { label: 'Closed', variant: 'neutral' },
    planned: { label: 'Planned', variant: 'warning' },
    cancelled: { label: 'Cancelled', variant: 'default' },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function TradeLogPage() {
  const toast = useToast()
  const { selectedAccountId } = useSessionStore()
  const [searchParams] = useSearchParams()

  const [trades, setTrades] = useState<TradeListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [closeTrade, setCloseTrade] = useState<TradeListItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  // Filters
  const [filterPair, setFilterPair] = useState('')
  const [filterMode, setFilterMode] = useState<TradeMode | ''>('')
  const [filterDirection, setFilterDirection] = useState<TradeDirection | ''>('')
  const [filterStatus, setFilterStatus] = useState<TradeStatus | ''>('')
  const [filterClean, setFilterClean] = useState<'clean' | 'dirty' | ''>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Pre-fill date filter from ?date=YYYY-MM-DD (calendar click-through)
  const dateParamApplied = useRef(false)
  useEffect(() => {
    if (dateParamApplied.current) return
    const date = searchParams.get('date')
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFilterDateFrom(date)
      setFilterDateTo(date)
      setFiltersOpen(true)
      dateParamApplied.current = true
    }
  }, [searchParams])

  const load = useCallback(() => {
    if (!selectedAccountId) return
    setLoading(true)
    const filter: TradeFilter = { accountId: selectedAccountId }
    if (filterMode) filter.mode = filterMode
    if (filterDirection) filter.direction = filterDirection
    if (filterStatus) filter.status = filterStatus
    if (filterClean === 'clean') filter.isClean = true
    if (filterClean === 'dirty') filter.isClean = false
    if (filterDateFrom) filter.dateFrom = new Date(filterDateFrom).getTime()
    if (filterDateTo) filter.dateTo = new Date(filterDateTo + 'T23:59:59').getTime()

    void ipc.trades.list(filter).then((res) => {
      setLoading(false)
      if (res.ok) {
        setTrades(res.data)
      }
    })
  }, [
    selectedAccountId,
    filterMode,
    filterDirection,
    filterStatus,
    filterClean,
    filterDateFrom,
    filterDateTo,
  ])

  useEffect(() => {
    load()
  }, [load])

  // Client-side pair filter (not sent to backend)
  const filtered = useMemo(() => {
    let list = trades
    if (filterPair.trim()) {
      const q = filterPair.trim().toLowerCase()
      list = list.filter((t) => t.pairSymbol.toLowerCase().includes(q))
    }
    return list
  }, [trades, filterPair])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      if (typeof av === 'string' && typeof bv === 'string') {
        return mul * av.localeCompare(bv)
      }
      return mul * ((av as number) - (bv as number))
    })
  }, [filtered, sortKey, sortDir])

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(col)
      setSortDir('desc')
    }
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(sorted.map((t) => t.id)) : new Set())
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} trade(s)? This cannot be undone.`)) return
    setDeleting(true)
    for (const id of selectedIds) {
      await ipc.trades.delete(id)
    }
    setDeleting(false)
    setSelectedIds(new Set())
    toast(`${selectedIds.size} trade(s) deleted.`, 'success')
    load()
  }

  async function handleActivate(trade: TradeListItem) {
    setActivating(trade.id)
    const res = await ipc.trades.setOpen(trade.id, trade.accountId)
    setActivating(null)
    if (res.ok) {
      toast('Trade activated. Position is now open.', 'success')
      load()
    } else {
      toast(res.error.message, 'error')
    }
  }

  function clearFilters() {
    setFilterPair('')
    setFilterMode('')
    setFilterDirection('')
    setFilterStatus('')
    setFilterClean('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const hasFilters =
    filterPair ||
    filterMode ||
    filterDirection ||
    filterStatus ||
    filterClean ||
    filterDateFrom ||
    filterDateTo
  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < sorted.length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-h2 font-semibold text-text-primary">Trade Log</h1>
          {!loading && <span className="text-caption text-text-muted">{sorted.length} trades</span>}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="text-caption text-text-muted">{selectedIds.size} selected</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportCsv(sorted.filter((t) => selectedIds.has(t.id)))}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleBulkDelete()}
                loading={deleting}
                className="text-danger hover:bg-danger/10"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                Delete
              </Button>
            </>
          )}
          {selectedIds.size === 0 && (
            <>
              <Button variant="secondary" size="sm" onClick={() => exportCsv(sorted)}>
                <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFiltersOpen((o) => !o)}
                className={cn(filtersOpen && 'bg-surface-elevated')}
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                Filters
                {hasFilters && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-accent-a" />}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters bar */}
      {filtersOpen && (
        <div
          className="px-6 py-3 flex flex-wrap items-end gap-3 shrink-0 glass-strong"
          style={{ borderBottom: '1px solid var(--glass-border)' }}
        >
          <div className="space-y-1">
            <label className="text-micro text-text-muted">Pair</label>
            <input
              value={filterPair}
              onChange={(e) => setFilterPair(e.target.value)}
              placeholder="e.g. EURUSD"
              className="h-7 w-28 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">Mode</label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as TradeMode | '')}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            >
              <option value="">All</option>
              <option value="live">Live</option>
              <option value="sim">Sim</option>
              <option value="backtest">Backtest</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">Direction</label>
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value as TradeDirection | '')}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            >
              <option value="">All</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TradeStatus | '')}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="planned">Planned</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">Quality</label>
            <select
              value={filterClean}
              onChange={(e) => setFilterClean(e.target.value as 'clean' | 'dirty' | '')}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            >
              <option value="">All</option>
              <option value="clean">Clean</option>
              <option value="dirty">Dirty</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">From</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-micro text-text-muted">To</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-7 rounded-[8px] border border-border bg-surface-elevated px-2 text-caption text-text-primary focus:outline-none"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-caption text-text-muted hover:text-text-secondary"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-body-sm text-text-muted">Loading…</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <span className="font-mono text-[60px] font-bold leading-none text-text-primary/5">
              {hasFilters ? '∅' : '02'}
            </span>
            <p className="text-body text-text-muted">
              {hasFilters ? 'No trades match these filters.' : 'No trades yet.'}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-body-sm">
            <thead
              className="sticky top-0 z-10 glass-strong"
              style={{ borderBottom: '1px solid var(--glass-border)' }}
            >
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-[var(--color-accent-a)]"
                  />
                </th>
                <Th col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Date
                </Th>
                <Th col="pairSymbol" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Pair
                </Th>
                <Th col="setupName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Setup
                </Th>
                <Th col="direction" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Dir
                </Th>
                <Th col="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Status
                </Th>
                <Th col="rrRatio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right>
                  RR
                </Th>
                <Th col="pnlCents" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right>
                  P&L $
                </Th>
                <Th col="pnlR" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right>
                  P&L R
                </Th>
                <Th
                  col="durationMinutes"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  right
                >
                  Duration
                </Th>
                <Th col="isClean" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  Clean
                </Th>
                <th className="px-3 py-2.5 text-left text-caption font-medium text-text-muted w-14">
                  Grade
                </th>
                <th className="px-3 py-2.5 text-left text-caption font-medium text-text-muted w-16">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((trade) => {
                const isSelected = selectedIds.has(trade.id)
                return (
                  <tr
                    key={trade.id}
                    onClick={() => setDetailId(trade.id)}
                    className={cn(
                      'border-b border-border cursor-pointer transition-colors hover:bg-surface-elevated',
                      isSelected && 'bg-accent-a/5',
                    )}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(trade.id)}
                        className="h-3.5 w-3.5 rounded border-border accent-[var(--color-accent-a)]"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">
                      {formatDate(trade.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-text-primary">
                      {trade.pairSymbol}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">{trade.setupName}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'font-medium',
                          trade.direction === 'long' ? 'text-accent-a' : 'text-danger',
                        )}
                      >
                        {trade.direction === 'long' ? '▲ L' : '▼ S'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={trade.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span
                        className={cn(
                          trade.rrRatio >= 200
                            ? 'text-accent-a'
                            : trade.rrRatio >= 150
                              ? 'text-warning'
                              : 'text-danger',
                        )}
                      >
                        {(trade.rrRatio / 100).toFixed(2)}R
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {trade.pnlCents !== null ? (
                        <span className={trade.pnlCents >= 0 ? 'text-accent-a' : 'text-danger'}>
                          {formatCents(trade.pnlCents)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {trade.pnlR !== null ? (
                        <span className={trade.pnlR >= 0 ? 'text-accent-a' : 'text-danger'}>
                          {formatRMultiple(trade.pnlR)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-text-secondary">
                      {trade.durationMinutes !== null
                        ? trade.durationMinutes < 60
                          ? `${trade.durationMinutes}m`
                          : `${Math.floor(trade.durationMinutes / 60)}h${trade.durationMinutes % 60}m`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {trade.isClean === 1 ? (
                        <Badge variant="success">Clean</Badge>
                      ) : trade.isClean === 0 ? (
                        <Badge variant="danger">Dirty</Badge>
                      ) : (
                        <span className="text-text-muted text-caption">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {trade.grade ? (
                        <GradeBadge grade={trade.grade} />
                      ) : (
                        <span className="text-text-muted text-caption">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {trade.status === 'planned' && (
                        <button
                          type="button"
                          disabled={activating === trade.id}
                          onClick={() => void handleActivate(trade)}
                          className="text-caption text-accent-a hover:underline disabled:opacity-50"
                        >
                          {activating === trade.id ? '…' : 'Open'}
                        </button>
                      )}
                      {trade.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => setCloseTrade(trade)}
                          className="text-caption text-accent-a hover:underline"
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Trade detail slide-over */}
      <TradeDetailModal
        tradeId={detailId}
        onClose={() => setDetailId(null)}
        onTradeUpdated={() => {
          setDetailId(null)
          load()
        }}
      />

      {/* Close trade modal (from row action) */}
      <CloseTradeModal
        open={closeTrade !== null}
        trade={closeTrade}
        onClose={() => setCloseTrade(null)}
        onClosed={() => {
          setCloseTrade(null)
          load()
        }}
      />
    </div>
  )
}
