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
      {/* Cockpit backdrop — HUD grid, neon depth orbs, and a horizon glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="hud-grid absolute inset-0" />
        <div
          className="absolute -left-24 -top-24 h-[400px] w-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--info) / 0.1) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="absolute -bottom-32 -right-16 h-[360px] w-[360px] rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--accent-b) / 0.08) 0%, transparent 70%)',
            filter: 'blur(48px)',
          }}
        />
        {/* Horizon glow — a low cyan band, like a cockpit skyline */}
        <div
          className="absolute inset-x-0 bottom-0 h-[42%]"
          style={{
            background:
              'radial-gradient(ellipse 70% 100% at 50% 130%, hsl(var(--info) / 0.14) 0%, transparent 70%)',
          }}
        />
      </div>
      <motion.div
        key={step}
        variants={slideUp}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative flex w-full max-w-[480px] flex-col gap-6"
      >
        {/* Segmented HUD progress — active segment glows cyan */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={[
                'h-1 rounded-full transition-all duration-300',
                i === step
                  ? 'w-8 bg-info shadow-[0_0_10px_hsl(var(--info)/0.7)]'
                  : i < step
                    ? 'w-4 bg-info/50'
                    : 'w-4 bg-border',
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
  )
}
