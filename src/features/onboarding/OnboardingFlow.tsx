import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ipc } from '../../lib/ipc'
import type { PropFirm, AccountTemplate, Account } from '@shared/types/index'
import { StepWelcome } from './steps/StepWelcome'
import { StepPropFirm } from './steps/StepPropFirm'
import { StepTemplate } from './steps/StepTemplate'
import { StepAccount } from './steps/StepAccount'
import { StepReviewDefaults } from './steps/StepReviewDefaults'
import { StepTheme } from './steps/StepTheme'
import { StepBackup } from './steps/StepBackup'
import { StepDone } from './steps/StepDone'

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
}

export function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState(STEP_WELCOME)
  const [propFirm, setPropFirm] = useState<PropFirm | null>(null)
  const [template, setTemplate] = useState<AccountTemplate | null>(null)
  const [_account, setAccount] = useState<Account | null>(null)
  const [defaultFirm, setDefaultFirm] = useState<PropFirm | null>(null)

  useEffect(() => {
    // Resume from last saved step
    ipc.settings.get<number>('onboarding_step').then((res) => {
      if (res.ok && res.data !== null && res.data > STEP_WELCOME) {
        setStep(res.data)
      }
    })
    // Load the default "Custom" firm
    ipc.propFirms.list().then((res) => {
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === STEP_WELCOME && (
        <StepWelcome
          key="welcome"
          step={step}
          totalSteps={TOTAL_STEPS}
          onNext={() => goToStep(STEP_PROP_FIRM)}
        />
      )}

      {step === STEP_PROP_FIRM && (
        <StepPropFirm
          key="prop-firm"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_WELCOME)}
          onNext={(firm) => {
            setPropFirm(firm)
            goToStep(STEP_TEMPLATE)
          }}
          onSkip={() => {
            if (defaultFirm) setPropFirm(defaultFirm)
            goToStep(STEP_THEME)
          }}
          defaultFirm={defaultFirm}
        />
      )}

      {step === STEP_TEMPLATE && (
        <StepTemplate
          key="template"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_PROP_FIRM)}
          onNext={(tmpl) => {
            setTemplate(tmpl)
            goToStep(STEP_ACCOUNT)
          }}
          propFirm={propFirm}
        />
      )}

      {step === STEP_ACCOUNT && (
        <StepAccount
          key="account"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_TEMPLATE)}
          onNext={(acct) => {
            setAccount(acct)
            goToStep(STEP_REVIEW_DEFAULTS)
          }}
          propFirm={propFirm}
          template={template}
        />
      )}

      {step === STEP_REVIEW_DEFAULTS && (
        <StepReviewDefaults
          key="review-defaults"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_ACCOUNT)}
          onNext={() => goToStep(STEP_THEME)}
        />
      )}

      {step === STEP_THEME && (
        <StepTheme
          key="theme"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_REVIEW_DEFAULTS)}
          onNext={() => goToStep(STEP_BACKUP)}
        />
      )}

      {step === STEP_BACKUP && (
        <StepBackup
          key="backup"
          step={step}
          totalSteps={TOTAL_STEPS}
          onBack={() => goToStep(STEP_THEME)}
          onNext={async (folderPath) => {
            if (folderPath) {
              await ipc.settings.set('backup_folder_path', folderPath)
            }
            goToStep(STEP_DONE)
          }}
        />
      )}

      {step === STEP_DONE && (
        <StepDone
          key="done"
          step={step}
          totalSteps={TOTAL_STEPS}
          onFinish={handleComplete}
        />
      )}
    </AnimatePresence>
  )
}
