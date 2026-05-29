import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2, CheckCircle2, XCircle, AlertTriangle, Paperclip } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { useSessionStore } from '../../stores/session-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useToast } from '../../components/ui'
import { Button, Select, Checkbox, Modal } from '../../components/ui'
import { calculateLotSizeFromRisk, calculateRR, calcRiskCentsFromPct } from '../../lib/calculators'
import type { PairType } from '../../lib/calculators'
import { formatPips } from '../../lib/formatters'
import { springDefault, respectReducedMotion } from '../../lib/motion'
import { cn } from '../../lib/cn'
import type {
  Account,
  Pair,
  Setup,
  Killzone,
  RuleEvaluationDTO,
  TradeDirection,
  DailyBias,
} from '@shared/types/index'

interface Props {
  open: boolean
  onClose: () => void
  onTradeCreated?: () => void
}

type Mode = 'live' | 'sim' | 'backtest'

interface FormState {
  pairId: string
  setupId: string
  killzoneId: string
  mode: Mode
  direction: TradeDirection | null
  entryStr: string
  slStr: string
  tpStr: string
  mssConfirmed: boolean
  htfBiasAligned: boolean
  dxyAligned: boolean
  smtConfirmed: boolean
  smtPair: string
  invalidation: string
  calmScore: number
  urgencyScore: number
  needScore: number
}

const BLANK: FormState = {
  pairId: '',
  setupId: '',
  killzoneId: '',
  mode: 'live',
  direction: null,
  entryStr: '',
  slStr: '',
  tpStr: '',
  mssConfirmed: false,
  htfBiasAligned: false,
  dxyAligned: false,
  smtConfirmed: false,
  smtPair: '',
  invalidation: '',
  calmScore: 7,
  urgencyScore: 3,
  needScore: 3,
}

function priceToDb(str: string, pipDecimal: number): number {
  const n = parseFloat(str)
  if (isNaN(n)) return 0
  return Math.round(n * Math.pow(10, pipDecimal + 1))
}

function detectKillzone(killzones: Killzone[]): string {
  const now = new Date()
  const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const active = killzones.find((kz) => {
    if (kz.active !== 1) return false
    if (kz.startTimeUtc <= kz.endTimeUtc) {
      return hhmm >= kz.startTimeUtc && hhmm <= kz.endTimeUtc
    }
    return hhmm >= kz.startTimeUtc || hhmm <= kz.endTimeUtc
  })
  return active?.id ?? ''
}

function RuleRow({ r }: { r: RuleEvaluationDTO }) {
  const icon =
    r.passed ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-accent-a shrink-0" strokeWidth={1.5} />
    ) : r.severity === 'blocking' ? (
      <XCircle className="h-3.5 w-3.5 text-danger shrink-0" strokeWidth={1.5} />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
    )
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className={cn('text-caption font-medium', r.passed ? 'text-text-secondary' : r.severity === 'blocking' ? 'text-danger' : 'text-warning')}>
          {r.ruleLabel}
        </p>
        {!r.passed && <p className="text-caption text-text-muted">{r.message}</p>}
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-caption text-text-secondary">{label}</label>
        <span className="font-mono text-caption text-text-primary">{value}</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--accent-a))] cursor-pointer"
      />
    </div>
  )
}

export function PreTradePanel({ open, onClose, onTradeCreated }: Props) {
  const toast = useToast()
  const { selectedAccountId, todaySession, refresh, bumpTradeVersion } = useSessionStore()
  const { riskMode, setRiskMode } = useSettingsStore()

  const [pairs, setPairs] = useState<Pair[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [killzones, setKillzones] = useState<Killzone[]>([])
  const [account, setAccount] = useState<Account | null>(null)
  const [riskDollarStr, setRiskDollarStr] = useState('')
  const [riskPctStr, setRiskPctStr] = useState('1')
  const [form, setForm] = useState<FormState>(BLANK)
  const [ruleResults, setRuleResults] = useState<RuleEvaluationDTO[]>([])
  const [evaluating, setEvaluating] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDiscard, setShowDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shake, setShake] = useState(false)
  const [pendingCharts, setPendingCharts] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load reference data + account for risk calculator
  useEffect(() => {
    if (!open) return
    Promise.all([
      ipc.pairs.list(),
      ipc.setups.list(),
      ipc.killzones.list(),
      ipc.accounts.list(),
      ipc.settings.get('default_risk_pct'),
    ]).then(([p, s, k, accs, riskSetting]) => {
      if (p.ok) setPairs(p.data.filter((x) => x.active === 1))
      if (s.ok) setSetups(s.data.filter((x) => x.active === 1))
      if (k.ok) {
        const active = k.data.filter((x) => x.active === 1)
        setKillzones(active)
        setForm((f) => ({ ...f, killzoneId: f.killzoneId || detectKillzone(active) }))
      }
      if (accs.ok && selectedAccountId) {
        const found = accs.data.find((a) => a.id === selectedAccountId) ?? null
        setAccount(found)
      }
      if (riskSetting.ok && typeof riskSetting.data === 'string') {
        try {
          const pct = JSON.parse(riskSetting.data) as number
          if (typeof pct === 'number' && pct > 0) setRiskPctStr(String(pct))
        } catch (_err) { /* ignore malformed setting */ }
      }
    })
  }, [open, selectedAccountId])

  // Auto-check HTF bias aligned when direction changes
  useEffect(() => {
    if (!todaySession || !form.direction) return
    const biasMap: Record<DailyBias, TradeDirection> = { bullish: 'long', bearish: 'short', neutral: 'long' }
    const aligned = biasMap[todaySession.dailyBias] === form.direction
    setForm((f) => ({ ...f, htfBiasAligned: aligned }))
  }, [form.direction, todaySession])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setForm(BLANK)
      setRuleResults([])
      setShowConfirm(false)
      setSaving(false)
      setRiskDollarStr('')
      setAccount(null)
      setPendingCharts([])
    }
  }, [open])

  const selectedPair = pairs.find((p) => p.id === form.pairId)

  // Derived integer values
  const pd = selectedPair?.pipDecimal ?? 4
  const entryDb = priceToDb(form.entryStr, pd)
  const slDb = priceToDb(form.slStr, pd)
  const tpDb = priceToDb(form.tpStr, pd)
  const slPipTenths = entryDb && slDb ? Math.abs(entryDb - slDb) : 0
  const tpPipTenths = entryDb && tpDb ? Math.abs(tpDb - entryDb) : 0
  const rrDb = calculateRR(slPipTenths, tpPipTenths)
  const pipValue = selectedPair?.pipValuePerStandardLotCents ?? 0

  // Risk calculator — live values
  const accountBalance = account?.currentEquityCents ?? 0
  const hasBalance = accountBalance > 0
  const leverage = account?.leverage ?? 100

  const riskUsdCents: number = riskMode === 'dollar'
    ? Math.round(parseFloat(riskDollarStr || '0') * 100)
    : calcRiskCentsFromPct(accountBalance, parseFloat(riskPctStr || '0'))

  const riskPctBps: number = hasBalance && riskUsdCents > 0
    ? Math.round((riskUsdCents / accountBalance) * 10000)
    : 0

  const lotSizeDb = calculateLotSizeFromRisk(
    riskUsdCents / 100,
    slPipTenths / 10,
    pipValue / 100,
    leverage,
    accountBalance / 100,
    (selectedPair?.assetClass as PairType | undefined) ?? 'forex',
  )
  const riskAmountCents = riskUsdCents

  const isFormFilled =
    !!form.pairId &&
    !!form.setupId &&
    !!form.direction &&
    !!form.entryStr &&
    !!form.slStr &&
    !!form.tpStr &&
    slPipTenths > 0 &&
    form.invalidation.length >= 20

  const hasBlockingFail = ruleResults.some((r) => !r.passed && r.severity === 'blocking')

  // Debounced rule evaluation
  const evaluateRules = useCallback(async () => {
    if (!isFormFilled || !selectedAccountId || !form.direction) return
    setEvaluating(true)
    const res = await ipc.rules.evaluatePreTrade({
      accountId: selectedAccountId,
      sessionId: todaySession?.id ?? null,
      pairId: form.pairId,
      setupId: form.setupId,
      killzoneId: form.killzoneId || null,
      direction: form.direction,
      entryPrice: entryDb,
      stopLossPrice: slDb,
      takeProfitPrice: tpDb,
      slPips: slPipTenths,
      rrRatio: rrDb,
      lotSize: lotSizeDb,
      riskAmountCents,
      riskPctBps,
      plannedInvalidation: form.invalidation,
      mssConfirmed: form.mssConfirmed ? 1 : 0,
      htfBiasAligned: form.htfBiasAligned ? 1 : 0,
      dxyAligned: form.dxyAligned ? 1 : 0,
      preCalmScore: form.calmScore,
      preUrgencyScore: form.urgencyScore,
      preNeedScore: form.needScore,
    })
    setEvaluating(false)
    if (res.ok) setRuleResults(res.data)
  }, [
    isFormFilled, selectedAccountId, form, todaySession,
    entryDb, slDb, tpDb, slPipTenths, rrDb, lotSizeDb, riskAmountCents, riskPctBps,
  ])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void evaluateRules() }, 150)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [evaluateRules])

  function isDirty() {
    return form.pairId !== '' || form.direction !== null || form.entryStr !== ''
  }

  function handleEscapeOrClose() {
    if (isDirty()) { setShowDiscard(true) } else { onClose() }
  }

  // ESC key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); handleEscapeOrClose() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (isFormFilled && !hasBlockingFail) void handlePlaceOrder()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isFormFilled, hasBlockingFail, form]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTrade(status: 'planned' | 'open') {
    if (!selectedAccountId || !form.direction) return
    setSaving(true)
    const res = await ipc.trades.create({
      accountId: selectedAccountId,
      sessionId: todaySession?.id ?? null,
      pairId: form.pairId,
      setupId: form.setupId,
      killzoneId: form.killzoneId || null,
      mode: form.mode,
      direction: form.direction,
      status,
      entryPrice: entryDb,
      stopLossPrice: slDb,
      takeProfitPrice: tpDb,
      slPips: slPipTenths,
      rrRatio: rrDb,
      lotSize: lotSizeDb,
      riskAmountCents,
      riskPctBps,
      plannedInvalidation: form.invalidation,
      mssConfirmed: form.mssConfirmed ? 1 : 0,
      htfBiasAligned: form.htfBiasAligned ? 1 : 0,
      dxyAligned: form.dxyAligned ? 1 : 0,
      smtConfirmed: form.smtConfirmed ? 1 : 0,
      correlatedPairUsed: form.smtPair || null,
      preCalmScore: form.calmScore,
      preUrgencyScore: form.urgencyScore,
      preNeedScore: form.needScore,
    })
    setSaving(false)
    if (res.ok) {
      for (const chartPath of pendingCharts) {
        await ipc.trades.addScreenshot(res.data.id, 'entry', chartPath)
      }
      bumpTradeVersion()
      await refresh()
      onTradeCreated?.()
      toast(status === 'open' ? 'Trade open.' : 'Draft saved.', 'success')
      onClose()
    } else {
      toast(res.error.message, 'error')
    }
  }

  async function handlePickCharts() {
    const res = await ipc.paths.pickImages()
    if (!res.ok || res.data.length === 0) return
    setPendingCharts((prev) => {
      const combined = [...prev, ...res.data]
      return combined.slice(0, 4)
    })
  }

  function handlePlaceOrder() {
    if (hasBlockingFail) {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      return
    }
    setShowConfirm(true)
  }

  const pairOptions = pairs.map((p) => ({ value: p.id, label: `${p.symbol} — ${p.displayName}` }))
  const setupOptions = setups.map((s) => ({ value: s.id, label: s.name }))
  const killzoneOptions = [
    { value: '', label: 'None / outside killzone' },
    ...killzones.map((k) => ({ value: k.id, label: k.name })),
  ]

  const rrDisplay = rrDb > 0 ? (rrDb / 100).toFixed(2) : '—'
  const rrColor = rrDb >= 200 ? 'text-accent-a' : rrDb >= 150 ? 'text-warning' : 'text-danger'

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={handleEscapeOrClose}
            className="fixed inset-0 z-40 bg-black/40"
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={respectReducedMotion(springDefault)}
            className="fixed right-0 top-0 bottom-0 z-50 flex w-[420px] flex-col glass-strong"
            style={{ borderLeft: '1px solid var(--glass-border)' }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-h3 font-semibold text-text-primary">New Trade</h2>
              <button
                type="button"
                onClick={handleEscapeOrClose}
                className="rounded-[8px] p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* A — Context */}
              <section className="rounded-[10px] glass p-3 space-y-1.5">
                {todaySession ? (
                  <>
                    <div className="flex items-center gap-2">
                      <BiasChip bias={todaySession.dailyBias} label="D" />
                      <BiasChip bias={todaySession.h4Bias} label="4H" />
                      <BiasChip bias={todaySession.h1Bias} label="1H" />
                      <span className="text-caption text-text-muted ml-1">Session logged</span>
                    </div>
                    {todaySession.sessionPlan && (
                      <p className="text-caption text-text-muted truncate">{todaySession.sessionPlan}</p>
                    )}
                  </>
                ) : (
                  <p className="text-caption text-warning">No session bias logged — trade may be blocked by rules.</p>
                )}
              </section>

              {/* B — Instrument */}
              <section className="space-y-3">
                <Select
                  label="Pair"
                  options={pairOptions}
                  value={form.pairId}
                  onChange={(v) => setForm((f) => ({ ...f, pairId: v }))}
                  searchable
                  placeholder="Select pair…"
                />
                <Select
                  label="Setup"
                  options={setupOptions}
                  value={form.setupId}
                  onChange={(v) => setForm((f) => ({ ...f, setupId: v }))}
                  placeholder="Select setup…"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Killzone"
                    options={killzoneOptions}
                    value={form.killzoneId}
                    onChange={(v) => setForm((f) => ({ ...f, killzoneId: v }))}
                  />
                  <div className="space-y-1.5">
                    <label className="text-caption font-medium text-text-secondary">Mode</label>
                    <div className="flex gap-1">
                      {(['live', 'sim', 'backtest'] as Mode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, mode: m }))}
                          className={cn(
                            'flex-1 rounded-[8px] border py-1.5 text-caption font-medium capitalize transition-colors',
                            form.mode === m
                              ? 'border-accent-a bg-accent-a/10 text-accent-a'
                              : 'border-border text-text-muted hover:border-border-strong',
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* C — Direction */}
              <section>
                <label className="text-caption font-medium text-text-secondary block mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['long', 'short'] as TradeDirection[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, direction: d }))}
                      className={cn(
                        'rounded-[10px] border py-2.5 text-body font-semibold uppercase transition-colors',
                        form.direction === d
                          ? d === 'long'
                            ? 'border-accent-a bg-accent-a/10 text-accent-a'
                            : 'border-danger bg-danger/10 text-danger'
                          : 'border-border text-text-muted hover:border-border-strong',
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </section>

              {/* D — Prices */}
              <section className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <PriceInput label="Entry" value={form.entryStr} onChange={(v) => setForm((f) => ({ ...f, entryStr: v }))} />
                  <PriceInput label="Stop loss" value={form.slStr} onChange={(v) => setForm((f) => ({ ...f, slStr: v }))} />
                  <PriceInput label="Take profit" value={form.tpStr} onChange={(v) => setForm((f) => ({ ...f, tpStr: v }))} />
                </div>

                {/* Computed strip */}
                {slPipTenths > 0 && (
                  <div className="grid grid-cols-4 gap-2 rounded-[10px] glass p-3">
                    <ComputedStat label="SL" value={formatPips(slPipTenths)} />
                    <ComputedStat label="TP" value={formatPips(tpPipTenths)} />
                    <ComputedStat label="RR" value={rrDisplay} valueClass={rrColor} />
                    <ComputedStat label="Lots" value={lotSizeDb > 0 ? (lotSizeDb / 100).toFixed(2) : '—'} />
                  </div>
                )}
              </section>

              {/* D2 — Risk calculator */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-caption font-medium text-text-secondary">Risk</p>
                    {account && (
                      <span className="text-micro text-text-muted font-mono">{leverage}:1</span>
                    )}
                  </div>
                  <div className="flex rounded-[8px] border border-border p-0.5 gap-0.5">
                    {(['dollar', 'percent'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setRiskMode(mode)}
                        className={cn(
                          'rounded-[6px] px-2.5 py-0.5 text-caption font-medium transition-colors',
                          riskMode === mode
                            ? 'bg-accent-a/15 text-accent-a'
                            : 'text-text-muted hover:text-text-secondary',
                        )}
                      >
                        {mode === 'dollar' ? '$ Amount' : '% Account'}
                      </button>
                    ))}
                  </div>
                </div>  {/* end outer flex justify-between */}

                {riskMode === 'percent' && !hasBalance ? (
                  <p className="text-caption text-warning">
                    Set account balance in Accounts to enable risk calculator.
                  </p>
                ) : riskMode === 'dollar' ? (
                  <div className="space-y-1">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-body-sm text-text-muted">$</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={riskDollarStr}
                        onChange={(e) => setRiskDollarStr(e.target.value)}
                        placeholder="50.00"
                        className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 pl-7 pr-3 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
                      />
                    </div>
                    {hasBalance && riskUsdCents > 0 && (
                      <p className="text-caption text-text-muted pl-1">
                        {(riskPctBps / 100).toFixed(2)}% of ${(accountBalance / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={riskPctStr}
                        onChange={(e) => setRiskPctStr(e.target.value)}
                        placeholder="1.0"
                        className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 pl-3 pr-8 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-body-sm text-text-muted">%</span>
                    </div>
                    {riskUsdCents > 0 && (
                      <p className="text-caption text-text-muted pl-1">
                        ≈ ${(riskUsdCents / 100).toFixed(2)} on ${(accountBalance / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* E — Confluence */}
              <section className="space-y-2">
                <p className="text-caption font-medium text-text-secondary">Confluence</p>
                <Checkbox
                  label="MSS confirmed"
                  checked={form.mssConfirmed}
                  onChange={(e) => setForm((f) => ({ ...f, mssConfirmed: e.target.checked }))}
                />
                <Checkbox
                  label="HTF bias aligned"
                  checked={form.htfBiasAligned}
                  onChange={(e) => setForm((f) => ({ ...f, htfBiasAligned: e.target.checked }))}
                />
                <Checkbox
                  label="DXY aligned"
                  checked={form.dxyAligned}
                  onChange={(e) => setForm((f) => ({ ...f, dxyAligned: e.target.checked }))}
                />
                <div className="space-y-1.5">
                  <Checkbox
                    label="SMT confirmed"
                    checked={form.smtConfirmed}
                    onChange={(e) => setForm((f) => ({ ...f, smtConfirmed: e.target.checked }))}
                  />
                  {form.smtConfirmed && (
                    <input
                      value={form.smtPair}
                      onChange={(e) => setForm((f) => ({ ...f, smtPair: e.target.value }))}
                      placeholder="Correlated pair (e.g. GBPUSD)"
                      className="ml-5 w-[calc(100%-20px)] rounded-[8px] border border-border bg-surface-elevated px-2.5 py-1.5 text-body-sm font-mono text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
                    />
                  )}
                </div>
              </section>

              {/* F — Invalidation */}
              <section className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-caption font-medium text-text-secondary">
                    This trade is wrong if…
                  </label>
                  <span className={cn('text-caption font-mono', form.invalidation.length < 20 ? 'text-text-muted' : 'text-accent-a')}>
                    {form.invalidation.length}/20+
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={form.invalidation}
                  onChange={(e) => setForm((f) => ({ ...f, invalidation: e.target.value }))}
                  placeholder="Describe the exact conditions that would invalidate this trade…"
                  className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
                />
                {form.invalidation.length > 0 && form.invalidation.length < 20 && (
                  <p className="text-caption text-danger">{20 - form.invalidation.length} more characters required.</p>
                )}
              </section>

              {/* G — Emotional state */}
              <section className="space-y-3">
                <p className="text-caption font-medium text-text-secondary">Pre-trade state</p>
                <Slider label="Calm (1=scattered, 10=focused)" value={form.calmScore} onChange={(v) => setForm((f) => ({ ...f, calmScore: v }))} />
                <Slider label="Urgency (1=patient, 10=chasing)" value={form.urgencyScore} onChange={(v) => setForm((f) => ({ ...f, urgencyScore: v }))} />
                <Slider label="Need to win (1=detached, 10=desperate)" value={form.needScore} onChange={(v) => setForm((f) => ({ ...f, needScore: v }))} />
              </section>

              {/* H — Rule evaluation */}
              <motion.section
                animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                transition={shake ? { duration: 0.3 } : {}}
                className="rounded-[10px] border border-border bg-surface-elevated p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-caption font-medium text-text-secondary">Rule check</p>
                  {evaluating && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" strokeWidth={1.5} />}
                </div>
                {ruleResults.length === 0 && !evaluating && (
                  <p className="text-caption text-text-muted">
                    {isFormFilled ? 'Evaluating…' : 'Fill in required fields to evaluate rules.'}
                  </p>
                )}
                <div className="space-y-0.5">
                  {ruleResults.map((r) => (
                    <RuleRow key={r.ruleKey} r={r} />
                  ))}
                </div>
              </motion.section>

              {/* Chart attachment */}
              <section>
                <button
                  type="button"
                  onClick={() => void handlePickCharts()}
                  className="flex items-center gap-1.5 text-caption text-text-muted hover:text-text-secondary transition-colors"
                >
                  <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {pendingCharts.length === 0
                    ? 'Attach chart screenshot (optional)'
                    : `${pendingCharts.length} chart${pendingCharts.length > 1 ? 's' : ''} attached`}
                </button>
              </section>
            </div>

            {/* Sticky footer */}
            <div className="shrink-0 border-t border-border px-5 py-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={!isFormFilled || saving}
                loading={saving}
                onClick={() => void saveTrade('planned')}
              >
                Save draft
              </Button>
              <Button
                className="flex-1"
                disabled={!isFormFilled || hasBlockingFail || saving}
                loading={saving}
                onClick={() => handlePlaceOrder()}
              >
                {hasBlockingFail ? 'Cannot submit' : 'Place order'}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}

      {/* Broker confirmation modal */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Order placed in broker?" maxWidth="380px">
        <p className="text-body-sm text-text-secondary mb-5">
          Confirm that you have placed this order in your broker platform. The trade will be marked open and the session will lock.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setShowConfirm(false)}>Actually, cancel</Button>
          <Button
            loading={saving}
            onClick={() => {
              setShowConfirm(false)
              void saveTrade('open')
            }}
          >
            Yes, it&apos;s placed
          </Button>
        </div>
      </Modal>

      {/* Discard draft modal */}
      <Modal open={showDiscard} onClose={() => setShowDiscard(false)} title="Discard draft?" maxWidth="360px">
        <p className="text-body-sm text-text-secondary mb-5">Your unsaved trade data will be lost.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setShowDiscard(false)}>Keep editing</Button>
          <Button variant="destructive" onClick={() => { setShowDiscard(false); onClose() }}>Discard</Button>
        </div>
      </Modal>
    </>
  )
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-caption font-medium text-text-secondary block">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00000"
        className="w-full rounded-[10px] border border-border bg-surface-elevated px-2.5 py-2 text-right font-mono text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none tabular-nums"
      />
    </div>
  )
}

function ComputedStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <p className="text-caption text-text-muted mb-0.5">{label}</p>
      <p className={cn('font-mono text-body-sm font-semibold text-text-primary', valueClass)}>{value}</p>
    </div>
  )
}

function BiasChip({ bias, label }: { bias: DailyBias; label: string }) {
  const cls = bias === 'bullish' ? 'bg-accent-a/15 text-accent-a' : bias === 'bearish' ? 'bg-danger/15 text-danger' : 'bg-border text-text-muted'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-micro font-semibold uppercase', cls)}>
      {label}
    </span>
  )
}
