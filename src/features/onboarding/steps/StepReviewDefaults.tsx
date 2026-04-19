import { OnboardingCard } from '../OnboardingCard'
import { Badge } from '../../../components/ui'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'XAU/USD', 'US30', 'NAS100']
const SETUPS = ['FVG', 'Order Block', 'Judas Swing', 'Silver Bullet', 'SMT Divergence']
const KILLZONES = ['Asia', 'London', 'NY AM', 'London Silver Bullet', 'NY PM Silver Bullet']

export function StepReviewDefaults({ step, totalSteps, onBack, onNext }: Props) {
  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Default pairs, setups, and killzones."
      description="Cairn comes pre-loaded with ICT essentials. Customize them anytime in Settings."
      onBack={onBack}
      onNext={onNext}
      nextLabel="Looks good"
    >
      <div className="flex flex-col gap-4 rounded-[10px] border border-border bg-surface p-4">
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-secondary">Pairs</p>
          <div className="flex flex-wrap gap-1.5">
            {PAIRS.map((p) => (
              <Badge key={p} variant="neutral" shape="solid">
                {p}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-secondary">Setups</p>
          <div className="flex flex-wrap gap-1.5">
            {SETUPS.map((s) => (
              <Badge key={s} variant="neutral" shape="solid">
                {s}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-label text-text-secondary">Killzones (UTC)</p>
          <div className="flex flex-wrap gap-1.5">
            {KILLZONES.map((k) => (
              <Badge key={k} variant="warning" shape="outline">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </OnboardingCard>
  )
}
