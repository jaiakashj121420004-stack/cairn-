import { AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import type {
  PropFirm,
  AccountTemplate,
  Account,
  CreateAccountPhaseInput,
} from '@shared/types/index'
import { ipc } from '../../lib/ipc'
import { StepAccount } from './steps/StepAccount'
import { StepBackup } from './steps/StepBackup'
import { StepDone } from './steps/StepDone'
import { StepPropFirm } from './steps/StepPropFirm'
import { StepReviewDefaults } from './steps/StepReviewDefaults'
import { StepTemplate } from './steps/StepTemplate'
import { StepTheme } from './steps/StepTheme'
import { StepWelcome } from './steps/StepWelcome'

const TOTAL_STEPS = 8

// Step indices
const STEP_WELCOME = 0
const STEP_PROP_FIRM = 1
const STEP_TEMPLATE = 2
const STEP_ACCOUNT = 3
const STEP_REVIEW_DEFAULTS = 4
const STEP_THEME = 5
const STEP_BACKUP = 6
const STEP_DONE = 7

interface Props {
  onComplete: () => void
  /** Enter first-run demo mode: seeds a sample account and jumps into the app. */
  onEnterDemo: () => void
}

export function OnboardingFlow({ onComplete, onEnterDemo }: Props) {
  const [step, setStep] = useState(STEP_WELCOME)
  const [demoLoading, setDemoLoading] = useState(false)
  const [propFirm, setPropFirm] = useState<PropFirm | null>(null)
  const [template, setTemplate] = useState<AccountTemplate | null>(null)
  // Full per-phase config from StepTemplate — the template row only keeps the
  // flat phase-1..3 targets + one drawdown set, so the account step needs this
  // to create lossless account_phases rows.
  const [templatePhases, setTemplatePhases] = useState<CreateAccountPhaseInput[] | null>(null)
  const [_account, setAccount] = useState<Account | null>(null)
  const [defaultFirm, setDefaultFirm] = useState<PropFirm | null>(null)

  useEffect(() => {
    // Resume from last saved step
    void ipc.settings.get<number>('onboarding_step').then((res) => {
      if (res.ok && res.data !== null && res.data > STEP_WELCOME) {
        setStep(res.data)
      }
    })
    // Load the default "Custom" firm
    void ipc.propFirms.list().then((res) => {
      if (res.ok) {
        const custom = res.data.find((f) => f.name === 'Custom')
        if (custom) setDefaultFirm(custom)
      }
    })
  }, [])

  async function goToStep(next: number) {
    await ipc.settings.set('onboarding_step', next)
    setStep(next)
  }

  async function handleComplete() {
    await ipc.settings.set('onboarding_completed', true)
    await ipc.settings.set('onboarding_step', STEP_DONE)
    onComplete()
  }

  async function handleDemo() {
    setDemoLoading(true)
    const res = await ipc.demo.enter()
    if (res.ok) {
      onEnterDemo()
    } else {
      setDemoLoading(false)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === STEP_WELCOME && (
        <StepWelcome
          key="welcome"
          step={step}
          totalSteps={TOTAL_STEPS}
          onNext={() => void goToStep(STEP_PROP_FIRM)}
          onDemo={() => void handleDemo()}
          demoLoading={demoLoading}
        />
      )}

      {step === STEP_PROP_FIRM && (
        <StepPropFirm
          key="prop-firm"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_WELCOME)}
          onNext={(firm) => {
            setPropFirm(firm)
            void goToStep(STEP_TEMPLATE)
          }}
          onSkip={() => {
            if (defaultFirm) setPropFirm(defaultFirm)
            void goToStep(STEP_THEME)
          }}
          defaultFirm={defaultFirm}
        />
      )}

      {step === STEP_TEMPLATE && (
        <StepTemplate
          key="template"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_PROP_FIRM)}
          onNext={(tmpl, phases) => {
            setTemplate(tmpl)
            setTemplatePhases(phases)
            void goToStep(STEP_ACCOUNT)
          }}
          propFirm={propFirm}
        />
      )}

      {step === STEP_ACCOUNT && (
        <StepAccount
          key="account"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_TEMPLATE)}
          onNext={(acct) => {
            setAccount(acct)
            void goToStep(STEP_REVIEW_DEFAULTS)
          }}
          propFirm={propFirm}
          template={template}
          templatePhases={templatePhases}
        />
      )}

      {step === STEP_REVIEW_DEFAULTS && (
        <StepReviewDefaults
          key="review-defaults"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_ACCOUNT)}
          onNext={() => void goToStep(STEP_THEME)}
        />
      )}

      {step === STEP_THEME && (
        <StepTheme
          key="theme"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_REVIEW_DEFAULTS)}
          onNext={() => void goToStep(STEP_BACKUP)}
        />
      )}

      {step === STEP_BACKUP && (
        <StepBackup
          key="backup"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => void goToStep(STEP_THEME)}
          onNext={async (folderPath) => {
            if (folderPath) {
              await ipc.settings.set('backup_folder_path', folderPath)
            }
            void goToStep(STEP_DONE)
          }}
        />
      )}

      {step === STEP_DONE && (
        <StepDone key="done" step={step} totalSteps={TOTAL_STEPS} onFinish={handleComplete} />
      )}
    </AnimatePresence>
  )
}
