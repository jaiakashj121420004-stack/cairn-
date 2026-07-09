import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { scaleIn, springBouncy } from '../../../lib/motion'
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
        initial="initial"
        animate="animate"
        transition={springBouncy}
        className="flex items-center justify-center py-4"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: 'hsl(var(--accent-a) / 0.12)',
            border: '1px solid hsl(var(--accent-a) / 0.4)',
            boxShadow: '0 0 30px hsl(var(--accent-a) / 0.35)',
          }}
        >
          <CheckCircle2 className="h-8 w-8 text-accent-a" strokeWidth={2} />
        </div>
      </motion.div>
    </OnboardingCard>
  )
}
