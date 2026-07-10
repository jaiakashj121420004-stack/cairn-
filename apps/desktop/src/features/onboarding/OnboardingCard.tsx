import { motion } from 'framer-motion'
import { Button } from '../../components/ui'
import { slideUp } from '../../lib/motion'

interface OnboardingCardProps {
  step: number
  totalSteps: number
  title: string
  description: string
  children?: React.ReactNode
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  skipSlot?: React.ReactNode
  loading?: boolean
}

export function OnboardingCard({
  step,
  totalSteps,
  title,
  description,
  children,
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
  skipSlot,
  loading = false,
}: OnboardingCardProps) {
  return (
    <div className="relative h-screen w-full overflow-y-auto bg-background">
      {/* Almanac masthead — a single oxblood double-rule at the page top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10" aria-hidden="true">
        <div className="h-[2px] w-full bg-[hsl(var(--ox))]" />
        <div className="mt-[2px] h-px w-full bg-border" />
      </div>
      <div className="flex min-h-full w-full items-center justify-center p-6">
        <motion.div
          key={step}
          variants={slideUp}
          initial="initial"
          animate="animate"
          exit="exit"
          className="relative flex w-full max-w-[480px] flex-col gap-6"
        >
          {/* Segmented progress — active segment is a solid oxblood rule */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={[
                  'h-1 rounded-full transition-all duration-300',
                  i === step ? 'w-8 bg-info' : i < step ? 'w-4 bg-info/50' : 'w-4 bg-border',
                ].join(' ')}
              />
            ))}
          </div>

          {/* Content */}
          <div className="flex flex-col gap-2">
            <h1 className="text-h2 font-semibold text-text-primary">{title}</h1>
            <p className="text-body text-text-muted">{description}</p>
          </div>

          {children && <div className="flex flex-col gap-4">{children}</div>}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {onBack && (
                <Button variant="ghost" size="md" onClick={onBack} disabled={loading}>
                  Back
                </Button>
              )}
              {skipSlot}
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={onNext}
              disabled={nextDisabled}
              loading={loading}
            >
              {nextLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
