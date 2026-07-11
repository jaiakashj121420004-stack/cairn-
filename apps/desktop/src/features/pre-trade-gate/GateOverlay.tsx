import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui'
import { ipc } from '../../lib/ipc'

/**
 * Pre-trade gate overlay (P0.7 slice 4). Renders in a frameless, always-on-top
 * window snapped over the MT5 chart. The EA drives it: `gate:intent` opens it with
 * the symbol/direction/entry, `gate:levels` streams the dragged SL/TP. The trader
 * completes the checklist and Confirms (→ a compliant plan) or hits Breach Rules
 * (→ an acknowledged-breach intent). Read-only: Cairn never places the order — the
 * trader types these numbers into MT5's own ticket.
 */

interface GateIntent {
  accountId: string
  pairId: string
  symbol: string
  direction: 'long' | 'short'
  price: number
}

interface GateLevels {
  symbol: string
  price: number
  stopLoss: number | null
  takeProfit: number | null
}

interface PairMeta {
  pipDecimal: number
  pipValuePerStandardLotCents: number
}

interface AccountMeta {
  currentEquityCents: number
}

const CONFLUENCES = [
  'HTF bias aligned',
  'MSS confirmed',
  'Liquidity swept',
  'FVG / OB retest',
  'In killzone',
] as const

export function GateOverlay() {
  const [intent, setIntent] = useState<GateIntent | null>(null)
  const [levels, setLevels] = useState<GateLevels | null>(null)
  const [pair, setPair] = useState<PairMeta | null>(null)
  const [account, setAccount] = useState<AccountMeta | null>(null)
  const [riskPct, setRiskPct] = useState(1)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [invalidation, setInvalidation] = useState('')
  const [busy, setBusy] = useState(false)

  // Hydrate the current intent + subscribe to live intent/levels from the EA.
  useEffect(() => {
    void ipc.gate.getIntent().then((res) => {
      if (res.ok && res.data) setIntent(res.data)
    })
    const offIntent = window.api.events.on('gate:intent', (p) => setIntent(p as GateIntent))
    const offLevels = window.api.events.on('gate:levels', (p) => setLevels(p as GateLevels))
    return () => {
      offIntent()
      offLevels()
    }
  }, [])

  // Load pair + account metadata once the intent is known (for lot/RR/risk math).
  const accountId = intent?.accountId
  const pairId = intent?.pairId
  useEffect(() => {
    if (!pairId) return
    void ipc.pairs.list().then((res) => {
      if (!res.ok) return
      const p = res.data.find((x) => x.id === pairId)
      if (p)
        setPair({
          pipDecimal: p.pipDecimal,
          pipValuePerStandardLotCents: p.pipValuePerStandardLotCents,
        })
    })
  }, [pairId])
  useEffect(() => {
    if (!accountId) return
    void ipc.accounts.list().then((res) => {
      if (!res.ok) return
      const a = res.data.find((x) => x.id === accountId)
      if (a) setAccount({ currentEquityCents: a.currentEquityCents })
    })
  }, [accountId])

  const entry = levels?.price ?? intent?.price ?? 0
  const sl = levels?.stopLoss ?? null
  const tp = levels?.takeProfit ?? null

  const calc = useMemo(() => {
    if (!pair || sl == null) return null
    const pipSize = Math.pow(10, -pair.pipDecimal)
    const slPips = pipSize > 0 ? Math.abs(entry - sl) / pipSize : 0
    const tpPips = tp != null && pipSize > 0 ? Math.abs(tp - entry) / pipSize : 0
    const rr = slPips > 0 ? tpPips / slPips : 0
    const balanceUsd = account ? account.currentEquityCents / 100 : 0
    const riskUsd = balanceUsd * (riskPct / 100)
    const pipValuePerLot = pair.pipValuePerStandardLotCents / 100
    const lots = slPips > 0 && pipValuePerLot > 0 ? riskUsd / (slPips * pipValuePerLot) : 0
    return { slPips, rr, riskUsd, lots }
  }, [pair, account, entry, sl, tp, riskPct])

  const canConfirm = intent != null && pair != null && sl != null && tp != null && !busy

  async function confirm(): Promise<void> {
    if (!intent || !pair || sl == null || tp == null || !calc) return
    setBusy(true)
    const enc = (p: number): number => Math.round(p * Math.pow(10, pair.pipDecimal + 1))
    const chosen = CONFLUENCES.filter((c) => checks[c])
    await ipc.gate.confirmPlan({
      accountId: intent.accountId,
      pairId: intent.pairId,
      direction: intent.direction,
      intendedEntry: enc(entry),
      intendedSl: enc(sl),
      intendedTp: enc(tp),
      slPips: Math.round(calc.slPips * 10),
      rrRatio: Math.round(calc.rr * 100),
      lotSize: Math.round(calc.lots * 100),
      riskPctBps: Math.round(riskPct * 100),
      confluencesJson: JSON.stringify(chosen),
      invalidation: invalidation.trim() || null,
    })
    setBusy(false)
  }

  async function breach(): Promise<void> {
    if (!intent) return
    setBusy(true)
    await ipc.gate.breachRules({
      accountId: intent.accountId,
      pairId: intent.pairId,
      direction: intent.direction,
    })
    setBusy(false)
  }

  if (!intent) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6 text-text-muted">
        <p className="text-body">Waiting for a Cairn Buy/Sell on the chart…</p>
      </div>
    )
  }

  const dirLabel = intent.direction === 'long' ? 'BUY' : 'SELL'

  return (
    <div className="flex h-screen flex-col gap-3 bg-background p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h3 font-semibold text-text-primary">
          Cairn <span className="text-[hsl(var(--ox))]">{dirLabel}</span> · {intent.symbol}
        </h1>
        <button
          type="button"
          className="text-caption text-text-muted hover:text-text-primary"
          onClick={() => void ipc.gate.dismiss()}
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-[10px] border border-border bg-surface-elevated p-3 text-center">
        <Readout label="Lot" value={calc ? calc.lots.toFixed(2) : '—'} />
        <Readout label="R:R" value={calc && calc.rr > 0 ? `${calc.rr.toFixed(2)}` : '—'} />
        <Readout label="Risk" value={calc ? `$${calc.riskUsd.toFixed(0)}` : '—'} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-caption text-text-muted">
        <span>Entry {entry.toFixed(pair?.pipDecimal ?? 5)}</span>
        <span>SL {sl != null ? sl.toFixed(pair?.pipDecimal ?? 5) : 'drag on chart'}</span>
        <span>TP {tp != null ? tp.toFixed(pair?.pipDecimal ?? 5) : 'drag on chart'}</span>
      </div>

      <label className="flex items-center justify-between text-body text-text-primary">
        Risk %
        <input
          type="number"
          min={0.1}
          max={10}
          step={0.1}
          value={riskPct}
          onChange={(e) => setRiskPct(Number(e.target.value) || 0)}
          className="w-20 rounded-[6px] border border-border bg-background px-2 py-1 text-right"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Confluences</span>
        {CONFLUENCES.map((c) => (
          <label key={c} className="flex items-center gap-2 text-body text-text-primary">
            <input
              type="checkbox"
              checked={!!checks[c]}
              onChange={(e) => setChecks((prev) => ({ ...prev, [c]: e.target.checked }))}
            />
            {c}
          </label>
        ))}
      </div>

      <textarea
        placeholder="Invalidation — when is this trade wrong?"
        value={invalidation}
        onChange={(e) => setInvalidation(e.target.value)}
        className="min-h-[52px] rounded-[8px] border border-border bg-background p-2 text-body"
      />

      <div className="mt-auto flex gap-2">
        <Button variant="primary" size="md" onClick={() => void confirm()} disabled={!canConfirm}>
          Confirm
        </Button>
        <Button variant="secondary" size="md" onClick={() => void breach()} disabled={busy}>
          Breach Rules
        </Button>
      </div>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-caption text-text-muted">{label}</div>
      <div className="font-mono text-h3 text-text-primary">{value}</div>
    </div>
  )
}
