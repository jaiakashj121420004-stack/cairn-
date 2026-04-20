import { useState, useEffect } from 'react'
import { X, Lock } from 'lucide-react'
import { Modal, Button, Input } from '../../components/ui'
import { useToast } from '../../components/ui'
import { ipc } from '../../lib/ipc'
import { useSessionStore } from '../../stores/session-store'
import { cn } from '../../lib/cn'
import type { DailyBias, Session } from '@shared/types/index'

interface Props {
  open: boolean
  onClose: () => void
}

const BIAS_OPTIONS: { value: DailyBias; label: string }[] = [
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'neutral', label: 'Neutral' },
]

const DXY_OPTIONS: { value: DailyBias | 'n/a'; label: string }[] = [
  { value: 'bullish', label: 'Bullish' },
  { value: 'bearish', label: 'Bearish' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'n/a', label: 'N/A' },
]

function BiasSelector({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string | null
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  disabled: boolean
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-[8px] border py-1.5 text-caption font-medium transition-colors',
            value === opt.value
              ? 'border-accent-a bg-accent-a/10 text-accent-a'
              : 'border-border text-text-muted hover:border-border-strong hover:text-text-secondary',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function KeyLevelsInput({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (v: string[]) => void
  disabled: boolean
}) {
  const [input, setInput] = useState('')

  function add() {
    const trimmed = input.trim()
    if (!trimmed || value.includes(trimmed)) { setInput(''); return }
    onChange([...value, trimmed])
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {value.map((lvl) => (
          <span
            key={lvl}
            className="flex items-center gap-1 rounded-[6px] bg-surface-elevated border border-border px-2 py-0.5 font-mono text-caption text-text-primary"
          >
            {lvl}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== lvl))}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={add}
          placeholder="Type a price level, press Enter…"
          className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm font-mono text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
        />
      )}
    </div>
  )
}

function BiasSection({
  label,
  bias,
  reason,
  onBiasChange,
  onReasonChange,
  disabled,
}: {
  label: string
  bias: DailyBias | null
  reason: string
  onBiasChange: (v: DailyBias) => void
  onReasonChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-caption font-medium text-text-secondary">{label}</p>
      <BiasSelector
        value={bias}
        onChange={(v) => onBiasChange(v as DailyBias)}
        options={BIAS_OPTIONS}
        disabled={disabled}
      />
      <input
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        disabled={disabled}
        placeholder={`Why ${label.toLowerCase()} is ${bias ?? '…'}`}
        className={cn(
          'w-full rounded-[10px] border border-border bg-surface-elevated py-2 px-3 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none',
          disabled && 'opacity-50',
        )}
      />
    </div>
  )
}

export function SessionBiasModal({ open, onClose }: Props) {
  const toast = useToast()
  const { selectedAccountId, todaySession, refresh } = useSessionStore()

  const locked = todaySession?.lockedAt !== null && todaySession?.lockedAt !== undefined

  const [dailyBias, setDailyBias] = useState<DailyBias | null>(null)
  const [dailyReason, setDailyReason] = useState('')
  const [h4Bias, setH4Bias] = useState<DailyBias | null>(null)
  const [h4Reason, setH4Reason] = useState('')
  const [h1Bias, setH1Bias] = useState<DailyBias | null>(null)
  const [h1Reason, setH1Reason] = useState('')
  const [dxyBias, setDxyBias] = useState<DailyBias | 'n/a' | null>(null)
  const [htfLiquidity, setHtfLiquidity] = useState('')
  const [smtNotes, setSmtNotes] = useState('')
  const [sessionPlan, setSessionPlan] = useState('')
  const [keyLevels, setKeyLevels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Populate from existing session
  useEffect(() => {
    if (open && todaySession) {
      setDailyBias(todaySession.dailyBias)
      setDailyReason(todaySession.dailyBiasReason)
      setH4Bias(todaySession.h4Bias)
      setH4Reason(todaySession.h4BiasReason)
      setH1Bias(todaySession.h1Bias)
      setH1Reason(todaySession.h1BiasReason)
      setDxyBias(todaySession.dxyBias)
      setHtfLiquidity(todaySession.htfLiquidityTarget ?? '')
      setSmtNotes(todaySession.smtNotes ?? '')
      setSessionPlan(todaySession.sessionPlan ?? '')
      setKeyLevels(todaySession.keyLevels ? (JSON.parse(todaySession.keyLevels) as string[]) : [])
    } else if (open && !todaySession) {
      setDailyBias(null)
      setDailyReason('')
      setH4Bias(null)
      setH4Reason('')
      setH1Bias(null)
      setH1Reason('')
      setDxyBias(null)
      setHtfLiquidity('')
      setSmtNotes('')
      setSessionPlan('')
      setKeyLevels([])
    }
  }, [open, todaySession])

  const canSave =
    !locked &&
    dailyBias !== null &&
    dailyReason.trim().length > 0 &&
    h4Bias !== null &&
    h4Reason.trim().length > 0 &&
    h1Bias !== null &&
    h1Reason.trim().length > 0

  async function handleSave() {
    if (!canSave || !selectedAccountId) return
    setSaving(true)
    const res = await ipc.sessions.upsert({
      accountId: selectedAccountId,
      dailyBias: dailyBias!,
      dailyBiasReason: dailyReason,
      h4Bias: h4Bias!,
      h4BiasReason: h4Reason,
      h1Bias: h1Bias!,
      h1BiasReason: h1Reason,
      ...(dxyBias ? { dxyBias } : {}),
      ...(htfLiquidity ? { htfLiquidityTarget: htfLiquidity } : {}),
      ...(smtNotes ? { smtNotes } : {}),
      ...(sessionPlan ? { sessionPlan } : {}),
      ...(keyLevels.length > 0 ? { keyLevels } : {}),
    })
    setSaving(false)
    if (res.ok) {
      await refresh()
      toast('Session bias logged.', 'success')
      onClose()
    } else {
      toast(res.error.message, 'error')
    }
  }

  function lockedLabel(session: Session) {
    return new Date(session.lockedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const title = locked && todaySession
    ? `Session Bias — Locked at ${lockedLabel(todaySession)}`
    : todaySession
    ? 'Edit Session Bias'
    : 'Log Session Bias'

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="600px">
      {locked && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
          <p className="text-caption text-text-muted">
            Session locked after first trade. Fields are read-only.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <BiasSection
          label="Daily bias"
          bias={dailyBias}
          reason={dailyReason}
          onBiasChange={setDailyBias}
          onReasonChange={setDailyReason}
          disabled={locked}
        />
        <BiasSection
          label="4H bias"
          bias={h4Bias}
          reason={h4Reason}
          onBiasChange={setH4Bias}
          onReasonChange={setH4Reason}
          disabled={locked}
        />
        <BiasSection
          label="1H bias"
          bias={h1Bias}
          reason={h1Reason}
          onBiasChange={setH1Bias}
          onReasonChange={setH1Reason}
          disabled={locked}
        />

        <div className="space-y-2">
          <p className="text-caption font-medium text-text-secondary">DXY bias</p>
          <BiasSelector
            value={dxyBias}
            onChange={(v) => setDxyBias(v as DailyBias | 'n/a')}
            options={DXY_OPTIONS}
            disabled={locked}
          />
        </div>

        <Input
          label="HTF liquidity target"
          value={htfLiquidity}
          onChange={(e) => setHtfLiquidity(e.target.value)}
          disabled={locked}
          placeholder="e.g. Buy-side liquidity above 1.0950"
        />

        <Input
          label="SMT notes"
          value={smtNotes}
          onChange={(e) => setSmtNotes(e.target.value)}
          disabled={locked}
          placeholder="e.g. EURUSD diverging from GBPUSD"
        />

        <div className="space-y-1.5">
          <label className="text-caption font-medium text-text-secondary">Session plan</label>
          <textarea
            rows={3}
            value={sessionPlan}
            onChange={(e) => setSessionPlan(e.target.value)}
            disabled={locked}
            placeholder="Today's trading plan and focus…"
            className={cn(
              'w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none',
              locked && 'opacity-50',
            )}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-medium text-text-secondary">Key levels</label>
          <KeyLevelsInput value={keyLevels} onChange={setKeyLevels} disabled={locked} />
        </div>
      </div>

      {!locked && (
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()} loading={saving} disabled={!canSave}>
            {todaySession ? 'Update session' : 'Log session'}
          </Button>
        </div>
      )}
    </Modal>
  )
}
