import { useState, useEffect, useCallback } from 'react'
import { X, Image as ImageIcon } from 'lucide-react'
import { Modal, Button, useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'
import { cn } from '../../lib/cn'
import { formatCents, formatRMultiple } from '../../lib/formatters'
import type { TradeListItem, ExitReason, ScreenshotKind } from '@shared/types/index'

interface Props {
  open: boolean
  trade: TradeListItem | null
  onClose: () => void
  onClosed: () => void
}

const EXIT_REASONS: { value: ExitReason; label: string }[] = [
  { value: 'tp', label: 'Take Profit hit' },
  { value: 'sl', label: 'Stop Loss hit' },
  { value: 'manual', label: 'Manual close' },
  { value: 'be', label: 'Break even' },
  { value: 'partial_full', label: 'Partial then full' },
  { value: 'timeout', label: 'Time-based exit' },
]

const SCREENSHOT_KINDS: { value: ScreenshotKind; label: string }[] = [
  { value: 'htf_context', label: 'HTF context' },
  { value: 'entry', label: 'Entry' },
  { value: 'exit', label: 'Exit' },
  { value: 'review', label: 'Review' },
  { value: 'other', label: 'Other' },
]

function priceToDb(floatStr: string, pipDecimal: number): number {
  const n = parseFloat(floatStr)
  if (isNaN(n)) return 0
  return Math.round(n * Math.pow(10, pipDecimal + 1))
}

function computePreview(
  trade: TradeListItem,
  exitPriceStr: string,
  exitTimeMs: number,
): { pnlCents: number; pnlR: number; pnlPctBps: number; durationMin: number } | null {
  const exitPrice = priceToDb(exitPriceStr, trade.pairPipDecimal)
  if (!exitPrice) return null
  const signedTenths =
    trade.direction === 'long'
      ? exitPrice - trade.entryPrice
      : trade.entryPrice - exitPrice
  const pnlCents = Math.round(
    (signedTenths * trade.lotSize * trade.pairPipValuePerLotCents) / 1000,
  )
  const pnlR = trade.slPips > 0 ? Math.round((signedTenths * 100) / trade.slPips) : 0
  const pnlPctBps = 0 // unknown without account size at renderer level
  const durationMin = Math.round((exitTimeMs - trade.createdAt) / 60000)
  return { pnlCents, pnlR, pnlPctBps, durationMin }
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-caption font-medium text-text-secondary">{label}</p>
      <div className="flex gap-2">
        {(['Yes', 'No'] as const).map((opt) => {
          const isYes = opt === 'Yes'
          const selected = value === isYes
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(isYes)}
              className={cn(
                'flex-1 rounded-[8px] border py-1.5 text-caption font-medium transition-colors',
                selected
                  ? isYes
                    ? 'border-accent-a bg-accent-a/10 text-accent-a'
                    : 'border-danger bg-danger/10 text-danger'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
              )}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-5">
      <p className="mb-4 text-caption font-semibold uppercase tracking-wide text-text-muted">
        {children}
      </p>
    </div>
  )
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const pct = ((value - 1) / 9) * 100
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <label className="text-caption text-text-secondary">{label}</label>
        <span className="font-mono text-caption text-text-primary">{value}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full appearance-none h-1.5 rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--color-accent-a) ${pct}%, var(--color-surface) ${pct}%)`,
          }}
        />
      </div>
    </div>
  )
}

function TagInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [input, setInput] = useState('')
  function add() {
    const t = input.trim()
    if (!t || value.includes(t)) { setInput(''); return }
    onChange([...value, t])
    setInput('')
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-[6px] bg-surface-elevated border border-border px-2 py-0.5 text-caption text-text-primary"
          >
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X className="h-3 w-3 text-text-muted hover:text-text-primary" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
          if (e.key === 'Backspace' && !input && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={add}
        placeholder="Add tag, press Enter…"
        className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
      />
    </div>
  )
}

export function CloseTradeModal({ open, trade, onClose, onClosed }: Props) {
  const toast = useToast()

  // Exit details
  const [exitPriceStr, setExitPriceStr] = useState('')
  const [exitTimeStr, setExitTimeStr] = useState('')
  const [exitReason, setExitReason] = useState<ExitReason | ''>('')
  const [maePipsStr, setMaePipsStr] = useState('')
  const [mfePipsStr, setMfePipsStr] = useState('')

  // Honesty
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null)
  const [planChanges, setPlanChanges] = useState('')
  const [slMoved, setSlMoved] = useState<boolean | null>(null)
  const [slMovedReason, setSlMovedReason] = useState('')
  const [enteredBeforeMss, setEnteredBeforeMss] = useState<boolean | null>(null)

  // Rules broken
  const [rulesBroken, setRulesBroken] = useState<string[]>([])
  const [availableRules, setAvailableRules] = useState<
    Array<{ key: string; label: string }>
  >([])

  // Reflection
  const [postCalmScore, setPostCalmScore] = useState(7)
  const [whatRight, setWhatRight] = useState('')
  const [whatWrong, setWhatWrong] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // Screenshots
  const [screenshots, setScreenshots] = useState<
    { sourcePath: string; kind: ScreenshotKind; preview: string }[]
  >([])

  const [saving, setSaving] = useState(false)

  // Populate defaults on open
  useEffect(() => {
    if (!open) return
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    setExitTimeStr(local.toISOString().slice(0, 16))
    setExitPriceStr('')
    setExitReason('')
    setMaePipsStr('')
    setMfePipsStr('')
    setFollowedPlan(null)
    setPlanChanges('')
    setSlMoved(null)
    setSlMovedReason('')
    setEnteredBeforeMss(null)
    setRulesBroken([])
    setPostCalmScore(7)
    setWhatRight('')
    setWhatWrong('')
    setTags([])
    setScreenshots([])

    ipc.rules.listAvailable().then((res) => {
      if (res.ok) setAvailableRules(res.data.map((r) => ({ key: r.key, label: r.label })))
    })
  }, [open])

  // Auto-check rules based on honesty answers
  useEffect(() => {
    setRulesBroken((prev) => {
      let next = [...prev]
      if (slMoved === true && !next.includes('no_sl_widening')) next.push('no_sl_widening')
      if (slMoved === false) next = next.filter((k) => k !== 'no_sl_widening')
      if (enteredBeforeMss === true && !next.includes('require_mss_confirmation'))
        next.push('require_mss_confirmation')
      if (enteredBeforeMss === false) next = next.filter((k) => k !== 'require_mss_confirmation')
      return next
    })
  }, [slMoved, enteredBeforeMss])

  const exitTimeMs = exitTimeStr
    ? new Date(exitTimeStr).getTime()
    : Date.now()

  const preview = trade ? computePreview(trade, exitPriceStr, exitTimeMs) : null

  const canSubmit =
    !!trade &&
    exitPriceStr.trim() !== '' &&
    !isNaN(parseFloat(exitPriceStr)) &&
    exitReason !== '' &&
    followedPlan !== null &&
    (followedPlan || planChanges.trim().length > 0) &&
    slMoved !== null &&
    (!slMoved || slMovedReason.trim().length > 0) &&
    enteredBeforeMss !== null &&
    !saving

  const handleAddScreenshots = useCallback(async () => {
    if (!trade) return
    const res = await ipc.trades.pickScreenshots(trade.id)
    if (!res.ok || res.data.length === 0) return
    const remaining = 4 - screenshots.length
    const paths = res.data.slice(0, remaining)
    const newItems = paths.map((p) => ({
      sourcePath: p,
      kind: 'other' as ScreenshotKind,
      preview: `file://${p.replace(/\\/g, '/')}`,
    }))
    setScreenshots((prev) => [...prev, ...newItems])
  }, [trade, screenshots.length])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (!trade || screenshots.length >= 4) return
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    const remaining = 4 - screenshots.length
    const items = files.slice(0, remaining).map((f) => ({
      // In Electron, File objects have a `.path` property
      sourcePath: (f as File & { path: string }).path,
      kind: 'other' as ScreenshotKind,
      preview: URL.createObjectURL(f),
    }))
    setScreenshots((prev) => [...prev, ...items])
  }

  async function handleSubmit() {
    if (!trade || !canSubmit) return
    setSaving(true)

    const exitPrice = priceToDb(exitPriceStr, trade.pairPipDecimal)
    const maePips = maePipsStr ? Math.round(parseFloat(maePipsStr) * 10) : undefined
    const mfePips = mfePipsStr ? Math.round(parseFloat(mfePipsStr) * 10) : undefined

    const res = await ipc.trades.close({
      tradeId: trade.id,
      exitPrice,
      exitTime: exitTimeMs,
      exitReason: exitReason as ExitReason,
      ...(maePips !== undefined ? { maePips } : {}),
      ...(mfePips !== undefined ? { mfePips } : {}),
      followedPlanExactly: followedPlan!,
      ...(planChanges.trim() ? { planChangesDescription: planChanges.trim() } : {}),
      slMoved: slMoved!,
      ...(slMovedReason.trim() ? { slMovedReason: slMovedReason.trim() } : {}),
      enteredBeforeMss: enteredBeforeMss!,
      rulesBroken,
      postCalmScore,
      ...(whatRight.trim() ? { whatIDidRight: whatRight.trim() } : {}),
      ...(whatWrong.trim() ? { whatIDidWrong: whatWrong.trim() } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    })

    if (!res.ok) {
      toast(res.error.message, 'error')
      setSaving(false)
      return
    }

    // Upload screenshots sequentially
    for (const ss of screenshots) {
      if (ss.sourcePath) {
        await ipc.trades.addScreenshot(trade.id, ss.kind, ss.sourcePath)
      }
    }

    // Notify rules engine
    await ipc.rules.onTradeClosed(trade.id)

    setSaving(false)
    toast('Trade closed.', 'success')
    onClosed()
  }

  if (!trade) return null

  const pairLabel = `${trade.pairSymbol} ${trade.direction === 'long' ? 'Long' : 'Short'}`

  return (
    <Modal open={open} onClose={onClose} title={`Close Trade — ${pairLabel}`} maxWidth="640px">
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-0">
        {/* Exit details */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">Exit price</label>
              <input
                type="number"
                step="any"
                value={exitPriceStr}
                onChange={(e) => setExitPriceStr(e.target.value)}
                placeholder="e.g. 1.0842"
                className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">Exit time</label>
              <input
                type="datetime-local"
                value={exitTimeStr}
                onChange={(e) => setExitTimeStr(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary focus:border-accent-a focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">Exit reason</label>
            <div className="grid grid-cols-3 gap-2">
              {EXIT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setExitReason(r.value)}
                  className={cn(
                    'rounded-[8px] border py-1.5 text-caption font-medium transition-colors',
                    exitReason === r.value
                      ? 'border-accent-a bg-accent-a/10 text-accent-a'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live P&L preview */}
          {preview && (
            <div className="rounded-[10px] border border-border bg-surface px-4 py-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-micro text-text-muted">P&L</p>
                <p
                  className={cn(
                    'font-mono text-body-sm font-semibold',
                    preview.pnlCents >= 0 ? 'text-accent-a' : 'text-danger',
                  )}
                >
                  {formatCents(preview.pnlCents)}
                </p>
              </div>
              <div>
                <p className="text-micro text-text-muted">R</p>
                <p
                  className={cn(
                    'font-mono text-body-sm font-semibold',
                    preview.pnlR >= 0 ? 'text-accent-a' : 'text-danger',
                  )}
                >
                  {formatRMultiple(preview.pnlR)}
                </p>
              </div>
              <div>
                <p className="text-micro text-text-muted">Duration</p>
                <p className="font-mono text-body-sm text-text-primary">
                  {preview.durationMin < 60
                    ? `${preview.durationMin}m`
                    : `${Math.floor(preview.durationMin / 60)}h ${preview.durationMin % 60}m`}
                </p>
              </div>
            </div>
          )}

          {/* MAE / MFE */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">
                MAE pips{' '}
                <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={maePipsStr}
                onChange={(e) => setMaePipsStr(e.target.value)}
                placeholder="e.g. 8.5"
                className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">
                MFE pips{' '}
                <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                type="number"
                step="0.1"
                value={mfePipsStr}
                onChange={(e) => setMfePipsStr(e.target.value)}
                placeholder="e.g. 22.0"
                className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Honesty section */}
        <SectionHeader>Honesty</SectionHeader>
        <div className="space-y-4">
          <YesNo
            label="Did you follow your plan exactly?"
            value={followedPlan}
            onChange={setFollowedPlan}
          />
          {followedPlan === false && (
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">
                What changed?
              </label>
              <textarea
                rows={2}
                value={planChanges}
                onChange={(e) => setPlanChanges(e.target.value)}
                placeholder="Describe what you did differently from the plan…"
                className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
              />
            </div>
          )}

          <YesNo label="Did you move your SL?" value={slMoved} onChange={setSlMoved} />
          {slMoved === true && (
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">Why?</label>
              <input
                value={slMovedReason}
                onChange={(e) => setSlMovedReason(e.target.value)}
                placeholder="Reason for moving SL…"
                className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
              />
            </div>
          )}

          <YesNo
            label="Did you enter before MSS was confirmed?"
            value={enteredBeforeMss}
            onChange={setEnteredBeforeMss}
          />
        </div>

        {/* Rules broken */}
        <SectionHeader>Rules broken</SectionHeader>
        <div className="space-y-1.5">
          {availableRules.map((rule) => (
            <label
              key={rule.key}
              className="flex items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-surface-elevated cursor-pointer"
            >
              <input
                type="checkbox"
                checked={rulesBroken.includes(rule.key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setRulesBroken((prev) => [...prev, rule.key])
                  } else {
                    setRulesBroken((prev) => prev.filter((k) => k !== rule.key))
                  }
                }}
                className="h-4 w-4 rounded border-border accent-[var(--color-accent-a)]"
              />
              <span className="text-body-sm text-text-secondary">{rule.label}</span>
            </label>
          ))}
          {availableRules.length === 0 && (
            <p className="text-caption text-text-muted px-2">Loading rules…</p>
          )}
        </div>

        {/* Post-trade reflection */}
        <SectionHeader>Reflection</SectionHeader>
        <div className="space-y-4">
          <SliderField
            label="Post-trade calm score"
            value={postCalmScore}
            onChange={setPostCalmScore}
          />

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">What I did right</label>
            <input
              value={whatRight}
              onChange={(e) => setWhatRight(e.target.value)}
              placeholder="One sentence…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">What I did wrong</label>
            <input
              value={whatWrong}
              onChange={(e) => setWhatWrong(e.target.value)}
              placeholder="One sentence…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">Tags</label>
            <TagInput value={tags} onChange={setTags} />
          </div>
        </div>

        {/* Screenshots */}
        <SectionHeader>Screenshots</SectionHeader>
        <div className="space-y-3">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={cn(
              'rounded-[12px] border-2 border-dashed border-border p-6 text-center transition-colors',
              screenshots.length >= 4 && 'opacity-50 pointer-events-none',
            )}
          >
            <ImageIcon className="mx-auto h-8 w-8 text-text-muted" strokeWidth={1} />
            <p className="mt-2 text-body-sm text-text-muted">
              Drag & drop screenshots here, or{' '}
              <button
                type="button"
                onClick={() => void handleAddScreenshots()}
                className="text-accent-a hover:underline"
              >
                pick files
              </button>
            </p>
            <p className="mt-1 text-caption text-text-muted">
              Up to 4 images. {screenshots.length}/4 added.
            </p>
          </div>

          {screenshots.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {screenshots.map((ss, i) => (
                <div key={i} className="relative rounded-[10px] overflow-hidden border border-border">
                  <img
                    src={ss.preview}
                    alt={`Screenshot ${i + 1}`}
                    className="w-full h-28 object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-background/80 backdrop-blur-sm p-2 flex items-center gap-2">
                    <select
                      value={ss.kind}
                      onChange={(e) => {
                        const next = [...screenshots]
                        next[i] = { ...next[i], kind: e.target.value as ScreenshotKind }
                        setScreenshots(next)
                      }}
                      className="flex-1 rounded-[6px] border border-border bg-surface py-1 px-2 text-caption text-text-primary focus:outline-none"
                    >
                      {SCREENSHOT_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded-[6px] text-text-muted hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="h-4" />
      </div>

      {/* Footer */}
      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => void handleSubmit()}
          loading={saving}
          disabled={!canSubmit}
        >
          Close trade
        </Button>
      </div>
    </Modal>
  )
}
