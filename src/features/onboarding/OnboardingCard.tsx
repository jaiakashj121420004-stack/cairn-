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
    <div className="relative flex h-screen w-full items-center justify-center bg-background p-6">
      {/* Background depth — makes glass surfaces visible */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -left-24 -top-24 h-[400px] w-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(var(--accent-a) / 0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute -bottom-32 -right-16 h-[360px] w-[360px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(var(--accent-b) / 0.07) 0%, transparent 70%)', filter: 'blur(48px)' }}
        />
      </div>
      <motion.div
        key={step}
        variants={slideUp}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className="flex w-full max-w-[480px] flex-col gap-6"
      >
        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={[
                'h-1.5 rounded-full transition-all duration-300',
                i === step
                  ? 'w-6 bg-accent-a'
                  : i < step
                    ? 'w-3 bg-accent-a/40'
                    : 'w-3 bg-border',
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
          <Button variant="primary" size="md" onClick={onNext} disabled={nextDisabled} loading={loading}>
            {nextLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
