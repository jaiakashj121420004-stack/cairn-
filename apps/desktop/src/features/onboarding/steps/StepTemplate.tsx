import { useState } from 'react'
import type {
  AccountTemplate,
  CreateAccountPhaseInput,
  DrawdownBasis,
  DrawdownType,
  PropFirm,
} from '@shared/types/index'
import {
  blankPhaseRow,
  PhaseRulesFields,
  phaseRowsToInputs,
  resizePhaseRows,
} from '../../../components/shared/PhaseRulesFields'
import { Input, Select } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { OnboardingCard } from '../OnboardingCard'
import type { PhaseFieldsRow } from '../../../components/shared/PhaseRulesFields'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  /**
   * `phases` carries the FULL per-phase config the user typed. The template row
   * itself keeps only the flat phase-1..3 target columns + one drawdown set
   * (templates are a convenience; accounts are the source of truth), so the
   * account step needs the array to create lossless account_phases rows.
   */
  onNext: (template: AccountTemplate | null, phases: CreateAccountPhaseInput[] | null) => void
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
  const stepCount = Math.max(1, Math.min(5, propFirm?.defaultStepCount ?? 2))
  const [name, setName] = useState('')
  const [accountSize, setAccountSize] = useState('100000')
  const [dailyDDType, setDailyDDType] = useState('percent_of_balance')
  const [ddBasis, setDdBasis] = useState('initial_balance')
  const [phaseRows, setPhaseRows] = useState<PhaseFieldsRow[]>(() =>
    resizePhaseRows([blankPhaseRow({ target: '10', daily: '5', total: '10' })], stepCount),
  )
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
    const converted = phaseRowsToInputs(
      phaseRows,
      dailyDDType as DrawdownType,
      'percent_of_balance',
    )
    if (!converted.ok) {
      setError(converted.error)
      return
    }
    const phases = converted.phases
    const p1 = phases[0]
    if (!p1 || p1.profitTargetPct === null) {
      setError('Phase 1 needs a profit target.')
      return
    }
    const p2 = phases[1]
    const p3 = phases[2]
    setLoading(true)
    setError('')
    const res = await ipc.accountTemplates.create({
      name: name.trim(),
      propFirmId,
      stepCount,
      accountSizeCents: Math.round(parseFloat(accountSize) * 100),
      leverage: 100,
      dailyDrawdownType: p1.dailyDrawdownType,
      dailyDrawdownValue: p1.dailyDrawdownValue,
      totalDrawdownType: p1.totalDrawdownType,
      totalDrawdownValue: p1.totalDrawdownValue,
      drawdownBasis: ddBasis as DrawdownBasis,
      profitTargetPhase1Pct: p1.profitTargetPct,
      ...(p2 && p2.profitTargetPct !== null ? { profitTargetPhase2Pct: p2.profitTargetPct } : {}),
      ...(p3 && p3.profitTargetPct !== null ? { profitTargetPhase3Pct: p3.profitTargetPct } : {}),
      weekendHoldingAllowed: false,
      newsTradingAllowed: false,
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    onNext(res.data, phases)
  }

  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Define the account template."
      description={`This firm's ladder has ${stepCount} ${stepCount === 1 ? 'phase' : 'phases'}. Set the rules for each — later phases mirror Phase 1 until you edit them.`}
      onBack={onBack}
      onNext={handleNext}
      nextDisabled={loading}
      loading={loading}
      skipSlot={
        <button
          type="button"
          onClick={() => onNext(null, null)}
          className="text-body text-text-muted underline-offset-2 hover:underline"
        >
          Skip
        </button>
      }
    >
      <Input
        label="Template name"
        placeholder="e.g. 2-Step — 100k"
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
      <PhaseRulesFields rows={phaseRows} onChange={setPhaseRows} idPrefix="onb-phase" />
    </OnboardingCard>
  )
}
