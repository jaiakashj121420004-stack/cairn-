import { useState } from 'react'
import type { PropFirm } from '@shared/types/index'
import { Input } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: (firm: PropFirm) => void
  onSkip: () => void
  defaultFirm: PropFirm | null
}

export function StepPropFirm({ step, totalSteps, onBack, onNext, onSkip, defaultFirm }: Props) {
  const [name, setName] = useState('')
  const [stepCount, setStepCount] = useState('2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleNext() {
    if (!name.trim()) {
      setError('Firm name is required.')
      return
    }
    setLoading(true)
    setError('')
    const res = await ipc.propFirms.create({
      name: name.trim(),
      defaultStepCount: Math.max(1, Math.min(5, parseInt(stepCount, 10) || 2)),
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
      title="Name your prop firm."
      description="Add the firm you're currently trading with. You can add more later in Settings."
      onBack={onBack}
      onNext={handleNext}
      nextDisabled={loading}
      loading={loading}
      skipSlot={
        <button
          type="button"
          onClick={() => onSkip()}
          className="text-body text-text-muted underline-offset-2 hover:underline"
        >
          Skip setup
        </button>
      }
    >
      <Input
        label="Firm name"
        placeholder="e.g. FTMO, My Forex Funds"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <Input
        label="Default phase count"
        hint="How many phases does this firm's challenge have?"
        type="number"
        value={stepCount}
        onChange={(e) => setStepCount(e.target.value)}
        numeric
      />
      {defaultFirm && (
        <p className="text-micro text-text-muted">
          &ldquo;Custom&rdquo; firm already exists for accounts without a specific firm.
        </p>
      )}
    </OnboardingCard>
  )
}
