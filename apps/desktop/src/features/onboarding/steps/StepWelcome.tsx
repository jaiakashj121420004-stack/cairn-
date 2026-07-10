import { Button } from '../../../components/ui'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onNext: () => void
  /** Optional: load a preloaded demo account instead of setting up a real one. */
  onDemo?: () => void
  demoLoading?: boolean
}

export function StepWelcome({ step, totalSteps, onNext, onDemo, demoLoading = false }: Props) {
  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Trade the plan, not the emotion."
      description="Cairn helps you enforce your own rules — before the click, not after. Set up your account once and let the system hold you to the standard you've already set."
      onNext={onNext}
      nextLabel="Get started"
      loading={demoLoading}
      skipSlot={
        onDemo ? (
          <Button variant="ghost" size="md" onClick={onDemo} disabled={demoLoading}>
            Explore a demo
          </Button>
        ) : undefined
      }
    />
  )
}
