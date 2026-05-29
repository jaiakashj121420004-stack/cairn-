import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle2, XCircle, AlertTriangle, Trash2 } from 'lucide-react'
import { Button, Badge, useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'
import { cn } from '../../lib/cn'
import {
  formatCents,
  formatRMultiple,
  formatPercent,
  formatPips,
  formatTimestamp,
  formatDate,
} from '../../lib/formatters'
import { springDefault } from '../../lib/motion'
import { CloseTradeModal } from '../post-trade/CloseTradeModal'
import { useSessionStore } from '../../stores/session-store'
import type { TradeDetail } from '@shared/types/index'

interface Props {
  tradeId: string | null
  onClose: () => void
  onTradeUpdated?: () => void
}

function dbToPrice(encoded: number, pipDecimal: number): string {
  return (encoded / Math.pow(10, pipDecimal + 1)).toFixed(pipDecimal)
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-caption text-text-muted shrink-0 w-36">{label}</span>
      <span className="text-body-sm text-text-primary text-right">{children}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-semibold uppercase tracking-wide text-text-muted mb-3 mt-5 first:mt-0">
      {children}
    </p>
  )
}

function CleanBadge({ isClean }: { isClean: number | null }) {
  if (isClean === null) return <Badge variant="default">—</Badge>
  return isClean === 1 ? (
    <Badge variant="success">Clean</Badge>
  ) : (
    <Badge variant="danger">Dirty</Badge>
  )
}

function PnlCell({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-text-muted">—</span>
  return (
    <span className={cn('font-mono font-semibold', cents >= 0 ? 'text-accent-a' : 'text-danger')}>
      {formatCents(cents)}
    </span>
  )
}

export function TradeDetailModal({ tradeId, onClose, onTradeUpdated }: Props) {
  const toast = useToast()
  const bumpTradeVersion = useSessionStore((s) => s.bumpTradeVersion)
  const [detail, setDetail] = useState<TradeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (!tradeId) { setDetail(null); return }
    setLoading(true)
    ipc.trades.get(tradeId).then((res) => {
      setLoading(false)
      if (res.ok) setDetail(res.data)
    })
  }, [tradeId])

  async function handleActivate() {
    if (!detail) return
    setActivating(true)
    const res = await ipc.trades.setOpen(detail.id, detail.accountId)
    setActivating(false)
    if (res.ok) {
      bumpTradeVersion()
      toast('Trade activated. Position is now open.', 'success')
      onTradeUpdated?.()
    } else {
      toast(res.error.message, 'error')
    }
  }

  async function handleDelete() {
    if (!detail) return
    if (!confirm('Delete this trade? This cannot be undone.')) return
    setDeleting(true)
    const res = await ipc.trades.delete(detail.id)
    setDeleting(false)
    if (res.ok) {
      toast('Trade deleted.', 'success')
      onTradeUpdated?.()
      onClose()
    } else {
      toast(res.error.message, 'error')
    }
  }

  async function handleDeleteScreenshot(screenshotId: string) {
    const res = await ipc.trades.deleteScreenshot(screenshotId)
    if (res.ok) {
      setDetail((prev) =>
        prev
          ? { ...prev, screenshots: prev.screenshots.filter((s) => s.id !== screenshotId) }
          : prev,
      )
    }
  }

  const open = tradeId !== null

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed right-0 top-0 z-50 h-full w-[520px] flex flex-col border-l border-border bg-surface-elevated shadow-2xl"
            initial={{ x: 520 }}
            animate={{ x: 0 }}
            exit={{ x: 520 }}
            transition={springDefault}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
              {detail ? (
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-body-sm font-semibold text-text-primary">
                      {detail.pairSymbol}{' '}
                      <span
                        className={cn(
                          'text-caption',
                          detail.direction === 'long' ? 'text-accent-a' : 'text-danger',
                        )}
                      >
                        {detail.direction === 'long' ? '▲ Long' : '▼ Short'}
                      </span>
                    </p>
                    <p className="text-caption text-text-muted">
                      {formatTimestamp(detail.createdAt)} · {detail.setupName}
                    </p>
                  </div>
                  <CleanBadge isClean={detail.isClean} />
                </div>
              ) : (
                <p className="text-body-sm text-text-muted">Loading…</p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-[8px] p-1.5 text-text-muted hover:bg-surface hover:text-text-primary"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <p className="text-center text-body-sm text-text-muted py-12">Loading…</p>
              )}

              {detail && (
                <>
                  {/* Status banner */}
                  {detail.status === 'planned' && (
                    <div className="mb-4 rounded-[10px] bg-warning/10 border border-warning/30 px-4 py-3 flex items-center justify-between">
                      <p className="text-body-sm text-warning font-medium">Planned trade</p>
                      <Button
                        size="sm"
                        loading={activating}
                        onClick={() => void handleActivate()}
                      >
                        Open position
                      </Button>
                    </div>
                  )}
                  {detail.status === 'open' && (
                    <div className="mb-4 rounded-[10px] bg-accent-a/10 border border-accent-a/30 px-4 py-3 flex items-center justify-between">
                      <p className="text-body-sm text-accent-a font-medium">Trade open</p>
                      <Button
                        size="sm"
                        onClick={() => setCloseOpen(true)}
                      >
                        Close trade
                      </Button>
                    </div>
                  )}

                  {/* P&L summary (for closed trades) */}
                  {detail.status === 'closed' && detail.pnlCents !== null && (
                    <div className="mb-4 rounded-[10px] border border-border bg-surface px-4 py-3 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-micro text-text-muted">P&L</p>
                        <PnlCell cents={detail.pnlCents} />
                      </div>
                      <div>
                        <p className="text-micro text-text-muted">R</p>
                        <span
                          className={cn(
                            'font-mono text-body-sm font-semibold',
                            (detail.pnlR ?? 0) >= 0 ? 'text-accent-a' : 'text-danger',
                          )}
                        >
                          {detail.pnlR !== null ? formatRMultiple(detail.pnlR) : '—'}
                        </span>
                      </div>
                      <div>
                        <p className="text-micro text-text-muted">Duration</p>
                        <span className="font-mono text-body-sm text-text-primary">
                          {detail.durationMinutes !== null
                            ? detail.durationMinutes < 60
                              ? `${detail.durationMinutes}m`
                              : `${Math.floor(detail.durationMinutes / 60)}h ${detail.durationMinutes % 60}m`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Pre-trade plan */}
                  <SectionTitle>Pre-trade plan</SectionTitle>
                  <Row label="Pair">{detail.pairSymbol}</Row>
                  <Row label="Setup">{detail.setupName}</Row>
                  {detail.killzoneName && <Row label="Killzone">{detail.killzoneName}</Row>}
                  <Row label="Mode">
                    <span className="capitalize">{detail.mode}</span>
                  </Row>
                  <Row label="Direction">
                    <span className={detail.direction === 'long' ? 'text-accent-a' : 'text-danger'}>
                      {detail.direction === 'long' ? 'Long' : 'Short'}
                    </span>
                  </Row>
                  <Row label="Entry">
                    <span className="font-mono">
                      {dbToPrice(detail.entryPrice, detail.pairPipDecimal)}
                    </span>
                  </Row>
                  <Row label="Stop loss">
                    <span className="font-mono">
                      {dbToPrice(detail.stopLossPrice, detail.pairPipDecimal)}
                    </span>
                  </Row>
                  <Row label="Take profit">
                    <span className="font-mono">
                      {dbToPrice(detail.takeProfitPrice, detail.pairPipDecimal)}
                    </span>
                  </Row>
                  <Row label="SL / TP pips">
                    <span className="font-mono">
                      {formatPips(detail.slPips)} /{' '}
                      {formatPips(Math.abs(detail.takeProfitPrice - detail.entryPrice))}
                    </span>
                  </Row>
                  <Row label="RR">
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        detail.rrRatio >= 200
                          ? 'text-accent-a'
                          : detail.rrRatio >= 150
                            ? 'text-warning'
                            : 'text-danger',
                      )}
                    >
                      {(detail.rrRatio / 100).toFixed(2)}R
                    </span>
                  </Row>
                  <Row label="Lot size">
                    <span className="font-mono">{(detail.lotSize / 100).toFixed(2)}</span>
                  </Row>
                  <Row label="Risk">
                    {formatCents(detail.riskAmountCents)} ({formatPercent(detail.riskPctBps)})
                  </Row>

                  <div className="mt-2 mb-1">
                    <p className="text-caption text-text-muted">Invalidation</p>
                    <p className="mt-1 text-body-sm text-text-primary">{detail.plannedInvalidation}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.mssConfirmed === 1 && (
                      <span className="inline-flex items-center gap-1 text-caption text-accent-a">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> MSS
                      </span>
                    )}
                    {detail.htfBiasAligned === 1 && (
                      <span className="inline-flex items-center gap-1 text-caption text-accent-a">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> HTF aligned
                      </span>
                    )}
                    {detail.dxyAligned === 1 && (
                      <span className="inline-flex items-center gap-1 text-caption text-accent-a">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> DXY aligned
                      </span>
                    )}
                    {detail.smtConfirmed === 1 && (
                      <span className="inline-flex items-center gap-1 text-caption text-accent-a">
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} /> SMT confirmed
                        {detail.correlatedPairUsed ? ` (${detail.correlatedPairUsed})` : ''}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-4 text-caption text-text-muted">
                    <span>Calm: {detail.preCalmScore}</span>
                    <span>Urgency: {detail.preUrgencyScore}</span>
                    <span>Need: {detail.preNeedScore}</span>
                  </div>

                  {/* Execution */}
                  {detail.status === 'closed' && (
                    <>
                      <SectionTitle>Execution</SectionTitle>
                      <Row label="Exit price">
                        <span className="font-mono">
                          {detail.exitPrice !== null
                            ? dbToPrice(detail.exitPrice, detail.pairPipDecimal)
                            : '—'}
                        </span>
                      </Row>
                      <Row label="Exit time">
                        {detail.exitTime ? formatTimestamp(detail.exitTime) : '—'}
                      </Row>
                      <Row label="Exit reason">
                        <span className="capitalize">{detail.exitReason?.replace('_', ' ') ?? '—'}</span>
                      </Row>
                      {detail.maePips !== null && (
                        <Row label="MAE">{formatPips(detail.maePips)}</Row>
                      )}
                      {detail.mfePips !== null && (
                        <Row label="MFE">{formatPips(detail.mfePips)}</Row>
                      )}
                    </>
                  )}

                  {/* Honesty */}
                  {detail.status === 'closed' && (
                    <>
                      <SectionTitle>Honesty</SectionTitle>
                      <Row label="Followed plan">
                        {detail.followedPlanExactly === 1 ? (
                          <span className="text-accent-a flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : detail.followedPlanExactly === 0 ? (
                          <span className="text-danger flex items-center gap-1">
                            <XCircle className="h-3.5 w-3.5" /> No
                          </span>
                        ) : '—'}
                      </Row>
                      {detail.planChangesDescription && (
                        <div className="py-2 border-b border-border">
                          <p className="text-caption text-text-muted">What changed</p>
                          <p className="text-body-sm text-text-primary mt-1">
                            {detail.planChangesDescription}
                          </p>
                        </div>
                      )}
                      <Row label="SL moved">
                        {detail.slMoved === 1 ? (
                          <span className="text-danger">Yes</span>
                        ) : detail.slMoved === 0 ? (
                          <span className="text-text-secondary">No</span>
                        ) : '—'}
                      </Row>
                      {detail.slMovedReason && (
                        <div className="py-2 border-b border-border">
                          <p className="text-caption text-text-muted">SL moved reason</p>
                          <p className="text-body-sm text-text-primary mt-1">{detail.slMovedReason}</p>
                        </div>
                      )}
                      <Row label="Entered before MSS">
                        {detail.enteredBeforeMss === 1 ? (
                          <span className="text-danger">Yes</span>
                        ) : detail.enteredBeforeMss === 0 ? (
                          <span className="text-text-secondary">No</span>
                        ) : '—'}
                      </Row>
                    </>
                  )}

                  {/* Rule violations */}
                  {detail.ruleViolations.length > 0 && (
                    <>
                      <SectionTitle>Rules broken</SectionTitle>
                      <div className="space-y-1">
                        {detail.ruleViolations.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 py-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
                            <span className="text-body-sm text-text-secondary font-mono text-caption">
                              {v.ruleKey}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Reflection */}
                  {(detail.whatIDidRight || detail.whatIDidWrong || detail.postCalmScore !== null) && (
                    <>
                      <SectionTitle>Reflection</SectionTitle>
                      {detail.postCalmScore !== null && (
                        <Row label="Post-trade calm">{detail.postCalmScore}/10</Row>
                      )}
                      {detail.whatIDidRight && (
                        <div className="py-2 border-b border-border">
                          <p className="text-caption text-text-muted">What I did right</p>
                          <p className="text-body-sm text-text-primary mt-1">{detail.whatIDidRight}</p>
                        </div>
                      )}
                      {detail.whatIDidWrong && (
                        <div className="py-2 border-b border-border">
                          <p className="text-caption text-text-muted">What I did wrong</p>
                          <p className="text-body-sm text-text-primary mt-1">{detail.whatIDidWrong}</p>
                        </div>
                      )}
                      {detail.tags && (
                        <div className="py-2 flex flex-wrap gap-1.5">
                          {(JSON.parse(detail.tags) as string[]).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-[6px] bg-surface border border-border px-2 py-0.5 text-caption text-text-secondary"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Screenshots */}
                  {detail.screenshots.length > 0 && (
                    <>
                      <SectionTitle>Screenshots</SectionTitle>
                      <div className="grid grid-cols-2 gap-2">
                        {detail.screenshots.map((ss) => (
                          <div
                            key={ss.id}
                            className="relative rounded-[10px] overflow-hidden border border-border group cursor-pointer"
                            onClick={() => void ipc.paths.openFile(ss.absolutePath)}
                          >
                            <img
                              src={`file://${ss.absolutePath.replace(/\\/g, '/')}`}
                              alt={ss.kind}
                              className="w-full h-24 object-cover"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-background/70 px-2 py-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-micro text-text-secondary capitalize">{ss.kind.replace('_', ' ')}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleDeleteScreenshot(ss.id) }}
                                className="p-0.5 text-text-muted hover:text-danger"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Partial closes */}
                  {detail.partialCloses.length > 0 && (
                    <>
                      <SectionTitle>Partial closes</SectionTitle>
                      <div className="space-y-2">
                        {detail.partialCloses.map((pc) => {
                          const exitFloat = pc.exitPrice / Math.pow(10, detail.pairPipDecimal + 1)
                          return (
                            <div
                              key={pc.id}
                              className="rounded-[8px] border border-border bg-surface px-3 py-2 grid grid-cols-4 gap-2 text-caption"
                            >
                              <div>
                                <p className="text-text-muted">Lots</p>
                                <p className="font-mono text-text-primary">
                                  {pc.closeLots !== null ? (pc.closeLots / 100).toFixed(2) : `${pc.closePercent.toFixed(0)}%`}
                                </p>
                              </div>
                              <div>
                                <p className="text-text-muted">Exit</p>
                                <p className="font-mono text-text-primary">{exitFloat.toFixed(detail.pairPipDecimal)}</p>
                              </div>
                              <div>
                                <p className="text-text-muted">P&L</p>
                                <p className={cn('font-mono font-semibold', (pc.pnlUsd ?? 0) >= 0 ? 'text-accent-a' : 'text-danger')}>
                                  {pc.pnlUsd !== null ? formatCents(Math.round(pc.pnlUsd * 100)) : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-text-muted">Time</p>
                                <p className="text-text-secondary">{formatDate(pc.exitTime)}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Related trades */}
                  {detail.relatedTrades.length > 0 && (
                    <>
                      <SectionTitle>Same-day trades</SectionTitle>
                      <div className="space-y-1">
                        {detail.relatedTrades.map((rt) => (
                          <div
                            key={rt.id}
                            className="flex items-center justify-between rounded-[8px] px-3 py-2 bg-surface border border-border text-body-sm"
                          >
                            <span className="text-text-secondary">
                              {rt.pairSymbol}{' '}
                              <span
                                className={
                                  rt.direction === 'long' ? 'text-accent-a' : 'text-danger'
                                }
                              >
                                {rt.direction === 'long' ? '▲' : '▼'}
                              </span>
                            </span>
                            <PnlCell cents={rt.pnlCents} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {detail && (
              <div className="border-t border-border px-5 py-3 flex items-center justify-between shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete()}
                  loading={deleting}
                  className="text-danger hover:bg-danger/10"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                  Delete
                </Button>
                {detail.status === 'planned' && (
                  <Button size="sm" loading={activating} onClick={() => void handleActivate()}>
                    Open position
                  </Button>
                )}
                {detail.status === 'open' && (
                  <Button size="sm" onClick={() => setCloseOpen(true)}>
                    Close trade
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {createPortal(panel, document.body)}

      {detail && (
        <CloseTradeModal
          open={closeOpen}
          trade={{
            id: detail.id,
            accountId: detail.accountId,
            sessionId: detail.sessionId,
            pairId: detail.pairId,
            pairSymbol: detail.pairSymbol,
            pairPipDecimal: detail.pairPipDecimal,
            pairPipValuePerLotCents: detail.pairPipValuePerLotCents,
            setupId: detail.setupId,
            setupName: detail.setupName,
            killzoneId: detail.killzoneId,
            killzoneName: detail.killzoneName,
            mode: detail.mode,
            direction: detail.direction,
            status: detail.status,
            entryPrice: detail.entryPrice,
            stopLossPrice: detail.stopLossPrice,
            takeProfitPrice: detail.takeProfitPrice,
            slPips: detail.slPips,
            rrRatio: detail.rrRatio,
            lotSize: detail.lotSize,
            riskAmountCents: detail.riskAmountCents,
            riskPctBps: detail.riskPctBps,
            exitPrice: detail.exitPrice,
            exitTime: detail.exitTime,
            exitReason: detail.exitReason,
            pnlCents: detail.pnlCents,
            pnlR: detail.pnlR,
            pnlPctBps: detail.pnlPctBps,
            durationMinutes: detail.durationMinutes,
            isClean: detail.isClean,
            rulesBroken: detail.rulesBroken,
            tags: detail.tags,
            followedPlanExactly: detail.followedPlanExactly,
            slMoved: detail.slMoved,
            enteredBeforeMss: detail.enteredBeforeMss,
            createdAt: detail.createdAt,
            updatedAt: detail.updatedAt,
          }}
          onClose={() => setCloseOpen(false)}
          onClosed={() => {
            setCloseOpen(false)
            onTradeUpdated?.()
            onClose()
          }}
        />
      )}
    </>
  )
}
