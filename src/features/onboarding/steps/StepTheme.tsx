import { OnboardingCard } from '../OnboardingCard'
import { useUiStore } from '../../../stores/ui-store'

type ThemePreference = 'dark' | 'light' | 'system'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
}

const OPTIONS: Array<{ value: ThemePreference; label: string; desc: string }> = [
  { value: 'dark', label: 'Dark', desc: 'Graphite & Citrus — default for focus sessions.' },
  { value: 'light', label: 'Light', desc: 'Bone & Forest — clean and readable.' },
  { value: 'system', label: 'System', desc: 'Follows your OS preference automatically.' },
]

export function StepTheme({ step, totalSteps, onBack, onNext }: Props) {
  const { themePreference, setThemePreference } = useUiStore()

  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Choose your theme."
      description="You can change this anytime from the sidebar."
      onBack={onBack}
      onNext={onNext}
    >
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setThemePreference(opt.value)}
            className={[
              'flex items-center justify-between rounded-[10px] border px-4 py-3 text-left transition-colors',
              themePreference === opt.value
                ? 'border-accent-a bg-accent-a/8'
                : 'border-border bg-surface hover:bg-surface-elevated',
            ].join(' ')}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-label font-medium text-text-primary">{opt.label}</span>
              <span className="text-micro text-text-muted">{opt.desc}</span>
            </div>
            <div
              className={[
                'h-4 w-4 rounded-full border-2 transition-colors',
                themePreference === opt.value
                  ? 'border-accent-a bg-accent-a'
                  : 'border-border bg-transparent',
              ].join(' ')}
            />
          </button>
        ))}
      </div>
    </OnboardingCard>
  )
}
