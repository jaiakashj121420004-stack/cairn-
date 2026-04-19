import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onNext: () => void
}

export function StepWelcome({ step, totalSteps, onNext }: Props) {
  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Trade the plan, not the emotion."
      description="Cairn helps you enforce your own rules — before the click, not after. Set up your account once and let the system hold you to the standard you've already set."
      onNext={onNext}
      nextLabel="Get started"
    />
  )
}
