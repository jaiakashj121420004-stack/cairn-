import { motion } from 'framer-motion'
import { scaleIn } from '../../../lib/motion'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onFinish: () => void
}

export function StepDone({ step, totalSteps, onFinish }: Props) {
  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="You're set up."
      description="Cairn is ready. Log your first session bias, then take your first trade — the plan holds."
      onNext={onFinish}
      nextLabel="Open dashboard"
    >
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        className="flex items-center justify-center py-4"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-a/10">
          <div className="h-8 w-8 rounded-full bg-accent-a" />
        </div>
      </motion.div>
    </OnboardingCard>
  )
}
