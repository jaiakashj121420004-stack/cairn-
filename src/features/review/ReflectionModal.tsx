import { useState, useEffect, useCallback } from 'react'
import { X, Paperclip, Check } from 'lucide-react'
import { Modal, Button, Tooltip, useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'
import { cn } from '../../lib/cn'
import { formatCents, formatRMultiple } from '../../lib/formatters'
import type { TradeListItem, CloseDetectionDTO } from '@shared/types/index'

interface Props {
  open: boolean
  trade: TradeListItem | null
  onClose: () => void
  onReflected: () => void
}

// ─── Small local field components ──────────────────────────────────────────────

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
      <p className="mb-4 text-caption font-semibold uppercase tracking-wide text-text-muted">{children}</p>
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = ((value - 1) / 9) * 100
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <label className="text-caption text-text-secondary">{label}</label>
        <span className="font-mono text-caption text-text-primary">{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full appearance-none h-1.5 rounded-full cursor-pointer"
        style={{ background: `linear-gradient(to right, var(--color-accent-a) ${pct}%, var(--color-surface) ${pct}%)` }}
      />
    </div>
  )
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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
          <span key={tag} className="flex items-center gap-1 rounded-[6px] bg-surface-elevated border border-border px-2 py-0.5 text-caption text-text-primary">
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
          if (e.key === 'Backspace' && !input && value.length > 0) onChange(value.slice(0, -1))
        }}
        onBlur={add}
        placeholder="Add tag, press Enter…"
        className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
      />
    </div>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────────

/**
 * Phase-2 reflection for a minimally-closed trade. Collects the deferred honesty
 * review, rules-broken checklist (pre-ticked from the engine's planned-vs-actual
 * detection), MAE/MFE, reflection notes and tags, then flips phase_2_complete → 1.
 * The honesty Y/N fields remain required — the gate moved, the honesty did not.
 */
export function ReflectionModal({ open, trade, onClose, onReflected }: Props) {
  const toast = useToast()

  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null)
  const [planChanges, setPlanChanges] = useState('')
  const [slMoved, setSlMoved] = useState<boolean | null>(null)
  const [slMovedReason, setSlMovedReason] = useState('')
  const [enteredBeforeMss, setEnteredBeforeMss] = useState<boolean | null>(null)
  const [rulesBroken, setRulesBroken] = useState<string[]>([])
  const [availableRules, setAvailableRules] = useState<Array<{ key: string; label: string }>>([])
  const [detected, setDetected] = useState<CloseDetectionDTO[]>([])
  const [maePipsStr, setMaePipsStr] = useState('')
  const [mfePipsStr, setMfePipsStr] = useState('')
  const [postCalmScore, setPostCalmScore] = useState(7)
  const [whatRight, setWhatRight] = useState('')
  const [whatWrong, setWhatWrong] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [screenshotCount, setScreenshotCount] = useState(0)
  const [saving, setSaving] = useState(false)

  const detectedByKey = new Map(detected.map((d) => [d.ruleKey, d.detail]))

  useEffect(() => {
    if (!open) return
    setFollowedPlan(null)
    setPlanChanges('')
    setSlMoved(null)
    setSlMovedReason('')
    setEnteredBeforeMss(null)
    setRulesBroken([])
    setMaePipsStr('')
    setMfePipsStr('')
    setPostCalmScore(7)
    setWhatRight('')
    setWhatWrong('')
    setTags([])
    setScreenshotCount(0)
    setDetected([])

    const tradeId = trade?.id
    void Promise.all([
      ipc.rules.listAvailable(),
      tradeId ? ipc.rules.detectCloseViolations(tradeId) : Promise.resolve(null),
    ]).then(([rulesRes, detectRes]) => {
      if (rulesRes.ok) setAvailableRules(rulesRes.data.map((r) => ({ key: r.key, label: r.label })))
      const items = detectRes && detectRes.ok ? detectRes.data : []
      setDetected(items)
      // Engine proposes, trader confirms — pre-tick what was detected.
      if (items.length > 0) setRulesBroken((prev) => Array.from(new Set([...prev, ...items.map((d) => d.ruleKey)])))
    }).catch(() => toast('Failed to load reflection context.', 'error'))
  }, [open, trade?.id, toast])

  // Keep the honesty answers and the checklist in agreement.
  useEffect(() => {
    setRulesBroken((prev) => {
      let next = [...prev]
      if (slMoved === true && !next.includes('no_sl_widening')) next.push('no_sl_widening')
      if (slMoved === false) next = next.filter((k) => k !== 'no_sl_widening')
      if (enteredBeforeMss === true && !next.includes('require_mss_confirmation')) next.push('require_mss_confirmation')
      if (enteredBeforeMss === false) next = next.filter((k) => k !== 'require_mss_confirmation')
      return next
    })
  }, [slMoved, enteredBeforeMss])

  const handleAttach = useCallback(async () => {
    if (!trade) return
    const res = await ipc.trades.pickScreenshots(trade.id)
    if (!res.ok || res.data.length === 0) return
    const remaining = 4 - screenshotCount
    for (const p of res.data.slice(0, remaining)) {
      await ipc.trades.addScreenshot(trade.id, 'review', p)
    }
    setScreenshotCount((n) => Math.min(4, n + res.data.length))
  }, [trade, screenshotCount])

  const canSubmit =
    !!trade &&
    followedPlan !== null &&
    (followedPlan || planChanges.trim().length > 0) &&
    slMoved !== null &&
    (!slMoved || slMovedReason.trim().length > 0) &&
    enteredBeforeMss !== null &&
    !saving

  async function handleSubmit() {
    if (!trade || !canSubmit) return
    setSaving(true)
    const maePips = maePipsStr ? Math.round(parseFloat(maePipsStr) * 10) : undefined
    const mfePips = mfePipsStr ? Math.round(parseFloat(mfePipsStr) * 10) : undefined

    const res = await ipc.trades.completePhase2({
      tradeId: trade.id,
      followedPlanExactly: followedPlan ?? false,
      ...(planChanges.trim() ? { planChangesDescription: planChanges.trim() } : {}),
      slMoved: slMoved ?? false,
      ...(slMovedReason.trim() ? { slMovedReason: slMovedReason.trim() } : {}),
      enteredBeforeMss: enteredBeforeMss ?? false,
      rulesBroken,
      ...(maePips !== undefined ? { maePips } : {}),
      ...(mfePips !== undefined ? { mfePips } : {}),
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
    setSaving(false)
    toast('Reflection saved.', 'success')
    onReflected()
  }

  if (!trade) return null

  const pairLabel = `${trade.pairSymbol} ${trade.direction === 'long' ? 'Long' : 'Short'}`

  return (
    <Modal open={open} onClose={onClose} title={`Reflect — ${pairLabel}`} maxWidth="640px">
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-0">
        {/* Outcome recap (read-only — captured at close) */}
        <div className="mb-1 grid grid-cols-3 gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-center">
          <div>
            <p className="text-micro text-text-muted">P&L</p>
            <p className={cn('font-mono text-body-sm font-semibold', (trade.pnlCents ?? 0) >= 0 ? 'text-accent-a' : 'text-danger')}>
              {trade.pnlCents !== null ? formatCents(trade.pnlCents) : '—'}
            </p>
          </div>
          <div>
            <p className="text-micro text-text-muted">R</p>
            <p className={cn('font-mono text-body-sm font-semibold', (trade.pnlR ?? 0) >= 0 ? 'text-accent-a' : 'text-danger')}>
              {trade.pnlR !== null ? formatRMultiple(trade.pnlR) : '—'}
            </p>
          </div>
          <div>
            <p className="text-micro text-text-muted">Exit reason</p>
            <p className="font-mono text-body-sm text-text-primary capitalize">{trade.exitReason ?? '—'}</p>
          </div>
        </div>

        {/* Honesty */}
        <SectionHeader>Honesty</SectionHeader>
        <div className="space-y-4">
          <YesNo label="Did you follow your plan exactly?" value={followedPlan} onChange={setFollowedPlan} />
          {followedPlan === false && (
            <textarea
              rows={2}
              value={planChanges}
              onChange={(e) => setPlanChanges(e.target.value)}
              placeholder="What did you do differently from the plan?"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
            />
          )}
          <YesNo label="Did you move your SL?" value={slMoved} onChange={setSlMoved} />
          {slMoved === true && (
            <input
              value={slMovedReason}
              onChange={(e) => setSlMovedReason(e.target.value)}
              placeholder="Reason for moving SL…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          )}
          <YesNo label="Did you enter before MSS was confirmed?" value={enteredBeforeMss} onChange={setEnteredBeforeMss} />
        </div>

        {/* Rules broken */}
        <SectionHeader>Rules broken</SectionHeader>
        {detected.length > 0 && (
          <p className="mb-2 px-2 text-caption text-text-muted">
            Cairn pre-ticked {detected.length} item{detected.length > 1 ? 's' : ''} from a planned-vs-actual
            check. Confirm or untick — the call is yours.
          </p>
        )}
        <div className="space-y-1.5">
          {availableRules.map((rule) => {
            const detail = detectedByKey.get(rule.key)
            return (
              <label key={rule.key} className="flex items-center gap-3 rounded-[8px] px-2 py-1.5 hover:bg-surface-elevated cursor-pointer">
                <input
                  type="checkbox"
                  checked={rulesBroken.includes(rule.key)}
                  onChange={(e) => {
                    if (e.target.checked) setRulesBroken((prev) => [...prev, rule.key])
                    else setRulesBroken((prev) => prev.filter((k) => k !== rule.key))
                  }}
                  className="h-4 w-4 rounded border-border accent-[var(--color-accent-a)]"
                />
                <span className="text-body-sm text-text-secondary">{rule.label}</span>
                {detail !== undefined && (
                  <Tooltip content={detail} side="top">
                    <span
                      data-testid={`detected-badge-${rule.key}`}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent-a/40 bg-accent-a/10 px-2 py-0.5 text-micro font-medium text-accent-a"
                    >
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                      detected by Cairn
                    </span>
                  </Tooltip>
                )}
              </label>
            )
          })}
          {availableRules.length === 0 && <p className="text-caption text-text-muted px-2">Loading rules…</p>}
        </div>

        {/* MAE / MFE */}
        <SectionHeader>Excursions</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">MAE pips <span className="font-normal text-text-muted">(optional)</span></label>
            <input
              type="number" step="0.1" value={maePipsStr}
              onChange={(e) => setMaePipsStr(e.target.value)} placeholder="e.g. 8.5"
              className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">MFE pips <span className="font-normal text-text-muted">(optional)</span></label>
            <input
              type="number" step="0.1" value={mfePipsStr}
              onChange={(e) => setMfePipsStr(e.target.value)} placeholder="e.g. 22.0"
              className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>
        </div>

        {/* Reflection */}
        <SectionHeader>Reflection</SectionHeader>
        <div className="space-y-4">
          <Slider label="Post-trade calm score" value={postCalmScore} onChange={setPostCalmScore} />
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">What I did right</label>
            <input value={whatRight} onChange={(e) => setWhatRight(e.target.value)} placeholder="One sentence…" className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">What I did wrong</label>
            <input value={whatWrong} onChange={(e) => setWhatWrong(e.target.value)} placeholder="One sentence…" className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none" />
          </div>
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">Tags</label>
            <TagInput value={tags} onChange={setTags} />
          </div>
          <button
            type="button"
            onClick={() => void handleAttach()}
            disabled={screenshotCount >= 4}
            className="flex items-center gap-1.5 text-caption text-text-muted hover:text-text-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
            {screenshotCount === 0 ? 'Attach chart screenshot (optional)' : `${screenshotCount} attached`}
          </button>
        </div>

        <div className="h-4" />
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void handleSubmit()} loading={saving} disabled={!canSubmit}>
          Mark reflected
        </Button>
      </div>
    </Modal>
  )
}
