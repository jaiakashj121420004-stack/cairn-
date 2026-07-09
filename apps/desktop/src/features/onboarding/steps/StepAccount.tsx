import { useState } from 'react'
import type {
  Account,
  AccountTemplate,
  CreateAccountInput,
  CreateAccountPhaseInput,
  PropFirm,
} from '@shared/types/index'
import { phaseLabel } from '../../../components/shared/PhaseRulesFields'
import { Input } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: (account: Account | null) => void
  propFirm: PropFirm | null
  template: AccountTemplate | null
  /** Full per-phase config typed on the template step (null if skipped). */
  templatePhases: CreateAccountPhaseInput[] | null
}

function fmtBps(bps: number): string {
  return `${bps / 100}%`
}

export function StepAccount({
  step,
  totalSteps,
  onBack,
  onNext,
  propFirm,
  template,
  templatePhases,
}: Props) {
  const [displayName, setDisplayName] = useState('')
  const [challengeCost, setChallengeCost] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const stepCount = template?.stepCount ?? propFirm?.defaultStepCount ?? 2

  /**
   * The per-phase ladder this account will be created with. Prefers the exact
   * values typed on the template step; falls back to the template's flat
   * phase-1..3 target columns (single drawdown set); falls back to defaults.
   */
  function buildPhases(): CreateAccountPhaseInput[] {
    if (templatePhases && templatePhases.length === stepCount) return templatePhases
    const targets: Array<number | null> = [
      template?.profitTargetPhase1Pct ?? 1000,
      template?.profitTargetPhase2Pct ?? null,
      template?.profitTargetPhase3Pct ?? null,
    ]
    return Array.from({ length: stepCount }, (_, i) => ({
      phaseNumber: i + 1,
      profitTargetPct: i < 3 ? (targets[i] ?? null) : null,
      dailyDrawdownType: template?.dailyDrawdownType ?? 'percent_of_balance',
      dailyDrawdownValue: template?.dailyDrawdownValue ?? 500,
      totalDrawdownType: template?.totalDrawdownType ?? 'percent_of_balance',
      totalDrawdownValue: template?.totalDrawdownValue ?? 1000,
    }))
  }

  const phasePreview = buildPhases()

  async function handleNext() {
    if (!displayName.trim()) {
      setError('Display name is required.')
      return
    }
    const firmId = propFirm?.id
    if (!firmId) {
      setError('No firm configured. Go back and create one first.')
      return
    }
    setLoading(true)
    setError('')

    const phases = buildPhases()
    const active = phases[0]

    const input: CreateAccountInput = {
      displayName: displayName.trim(),
      propFirmId: firmId,
      stepCount,
      currentPhase: 1,
      accountSizeCents: template?.accountSizeCents ?? 10_000_00,
      leverage: template?.leverage ?? 100,
      dailyDrawdownType: active?.dailyDrawdownType ?? 'percent_of_balance',
      dailyDrawdownValue: active?.dailyDrawdownValue ?? 500,
      totalDrawdownType: active?.totalDrawdownType ?? 'percent_of_balance',
      totalDrawdownValue: active?.totalDrawdownValue ?? 1000,
      drawdownBasis: template?.drawdownBasis ?? 'initial_balance',
      profitTargetPct: active?.profitTargetPct ?? 0,
      weekendHoldingAllowed: template ? !!template.weekendHoldingAllowed : false,
      newsTradingAllowed: template ? !!template.newsTradingAllowed : false,
      challengeCostCents: Math.round(parseFloat(challengeCost || '0') * 100),
      startDate: Date.now(),
      phases,
    }
    if (template?.id) input.templateId = template.id
    if (template?.minTradingDays != null) input.minTradingDays = template.minTradingDays
    if (template?.maxTradingDays != null) input.maxTradingDays = template.maxTradingDays
    if (template?.consistencyRulePct != null) input.consistencyRulePct = template.consistencyRulePct

    const res = await ipc.accounts.create(input)
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    onNext(res.data)
  }

  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Create your first account."
      description="Give this trading account a name you'll recognize. Rules and tracking are per-account."
      onBack={onBack}
      onNext={handleNext}
      nextDisabled={loading}
      loading={loading}
      skipSlot={
        <button
          type="button"
          onClick={() => onNext(null)}
          className="text-body text-text-muted underline-offset-2 hover:underline"
        >
          Skip
        </button>
      }
    >
      <Input
        label="Account name"
        placeholder="e.g. Phase 1 — Jan 2026"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={error}
      />
      <Input
        label="Challenge cost (optional)"
        hint="What did this account cost to purchase?"
        type="number"
        value={challengeCost}
        onChange={(e) => setChallengeCost(e.target.value)}
        numeric
        unit="USD"
      />
      {template && (
        <p className="text-micro text-text-muted">
          Using template: <span className="text-text-secondary">{template.name}</span>
        </p>
      )}
      <div className="space-y-1">
        <p className="text-caption font-medium text-text-secondary">Phase rules on this account</p>
        {phasePreview.map((p) => (
          <p key={p.phaseNumber} className="text-micro text-text-muted">
            {phaseLabel(p.phaseNumber, stepCount)} · target{' '}
            {p.profitTargetPct === null ? 'none' : fmtBps(p.profitTargetPct)} · daily DD{' '}
            {fmtBps(p.dailyDrawdownValue)} · total DD {fmtBps(p.totalDrawdownValue)}
          </p>
        ))}
      </div>
    </OnboardingCard>
  )
}
