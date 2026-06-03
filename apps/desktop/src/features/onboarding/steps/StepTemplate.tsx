import { useState } from 'react'
import type { AccountTemplate, PropFirm } from '@shared/types/index'
import { Input, Select } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: (template: AccountTemplate | null) => void
  propFirm: PropFirm | null
}

const DD_TYPE_OPTIONS = [
  { value: 'percent_of_balance', label: '% of Balance' },
  { value: 'percent_of_equity', label: '% of Equity' },
  { value: 'fixed_amount', label: 'Fixed Amount ($)' },
]

const DD_BASIS_OPTIONS = [
  { value: 'initial_balance', label: 'Initial Balance' },
  { value: 'high_water_mark', label: 'High Water Mark' },
  { value: 'previous_day_close', label: 'Previous Day Close' },
]

export function StepTemplate({ step, totalSteps, onBack, onNext, propFirm }: Props) {
  const [name, setName] = useState('')
  const [accountSize, setAccountSize] = useState('100000')
  const [dailyDD, setDailyDD] = useState('5')
  const [totalDD, setTotalDD] = useState('10')
  const [dailyDDType, setDailyDDType] = useState('percent_of_balance')
  const [ddBasis, setDdBasis] = useState('initial_balance')
  const [profitTarget, setProfitTarget] = useState('10')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const propFirmId = propFirm?.id ?? ''

  async function handleNext() {
    if (!name.trim()) {
      setError('Template name is required.')
      return
    }
    if (!propFirmId) {
      setError('No firm selected. Go back and create a firm first.')
      return
    }
    setLoading(true)
    setError('')
    const res = await ipc.accountTemplates.create({
      name: name.trim(),
      propFirmId,
      stepCount: propFirm?.defaultStepCount ?? 2,
      accountSizeCents: Math.round(parseFloat(accountSize) * 100),
      leverage: 100,
      dailyDrawdownType: dailyDDType as 'percent_of_balance' | 'percent_of_equity' | 'fixed_amount',
      dailyDrawdownValue: Math.round(parseFloat(dailyDD) * 100),
      totalDrawdownType: 'percent_of_balance',
      totalDrawdownValue: Math.round(parseFloat(totalDD) * 100),
      drawdownBasis: ddBasis as 'initial_balance' | 'high_water_mark' | 'previous_day_close',
      profitTargetPhase1Pct: Math.round(parseFloat(profitTarget) * 100),
      weekendHoldingAllowed: false,
      newsTradingAllowed: false,
    })
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
      title="Define the account template."
      description="Templates let you reuse drawdown rules across multiple accounts. You can skip this and configure each account individually."
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
        label="Template name"
        placeholder="e.g. Phase 1 — 100k"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <Input
        label="Account size ($)"
        type="number"
        value={accountSize}
        onChange={(e) => setAccountSize(e.target.value)}
        numeric
        unit="USD"
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Daily drawdown"
          type="number"
          value={dailyDD}
          onChange={(e) => setDailyDD(e.target.value)}
          numeric
          unit="%"
        />
        <Input
          label="Total drawdown"
          type="number"
          value={totalDD}
          onChange={(e) => setTotalDD(e.target.value)}
          numeric
          unit="%"
        />
      </div>
      <Select
        label="Drawdown type"
        options={DD_TYPE_OPTIONS}
        value={dailyDDType}
        onChange={setDailyDDType}
      />
      <Select
        label="Drawdown basis"
        options={DD_BASIS_OPTIONS}
        value={ddBasis}
        onChange={setDdBasis}
      />
      <Input
        label="Phase 1 profit target"
        type="number"
        value={profitTarget}
        onChange={(e) => setProfitTarget(e.target.value)}
        numeric
        unit="%"
      />
    </OnboardingCard>
  )
}
