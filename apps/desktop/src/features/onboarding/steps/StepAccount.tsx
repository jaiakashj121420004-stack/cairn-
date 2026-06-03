import { useState } from 'react'
import type { Account, AccountTemplate, CreateAccountInput, PropFirm } from '@shared/types/index'
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
}

export function StepAccount({ step, totalSteps, onBack, onNext, propFirm, template }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [challengeCost, setChallengeCost] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

    const input: CreateAccountInput = {
      displayName: displayName.trim(),
      propFirmId: firmId,
      stepCount: template?.stepCount ?? propFirm?.defaultStepCount ?? 2,
      currentPhase: 1,
      accountSizeCents: template?.accountSizeCents ?? 10_000_00,
      leverage: template?.leverage ?? 100,
      dailyDrawdownType:
        (template?.dailyDrawdownType as CreateAccountInput['dailyDrawdownType']) ??
        'percent_of_balance',
      dailyDrawdownValue: template?.dailyDrawdownValue ?? 500,
      totalDrawdownType:
        (template?.totalDrawdownType as CreateAccountInput['totalDrawdownType']) ??
        'percent_of_balance',
      totalDrawdownValue: template?.totalDrawdownValue ?? 1000,
      drawdownBasis:
        (template?.drawdownBasis as CreateAccountInput['drawdownBasis']) ?? 'initial_balance',
      profitTargetPct: template?.profitTargetPhase1Pct ?? 1000,
      weekendHoldingAllowed: template ? !!template.weekendHoldingAllowed : false,
      newsTradingAllowed: template ? !!template.newsTradingAllowed : false,
      challengeCostCents: Math.round(parseFloat(challengeCost || '0') * 100),
      startDate: Date.now(),
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
    </OnboardingCard>
  )
}
