import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import { OnboardingCard } from '../OnboardingCard'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
  onNext: (folderPath: string) => void
}

export function StepBackup({ step, totalSteps, onBack, onNext }: Props) {
  const [folderPath, setFolderPath] = useState('')
  const [picking, setPicking] = useState(false)

  async function pickFolder() {
    setPicking(true)
    const res = await ipc.paths.pickFolder()
    setPicking(false)
    if (res.ok && res.data) {
      setFolderPath(res.data)
    }
  }

  function handleNext() {
    onNext(folderPath)
  }

  return (
    <OnboardingCard
      step={step}
      totalSteps={totalSteps}
      title="Where should Cairn back up your data?"
      description="Point to a folder — a local drive, a synced Google Drive folder, or a USB stick. Cairn writes a single database file. No cloud accounts required."
      onBack={onBack}
      onNext={handleNext}
      nextLabel={folderPath ? 'Save & continue' : 'Skip for now'}
    >
      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4">
        {folderPath ? (
          <div className="flex flex-col gap-1">
            <p className="text-label text-text-secondary">Selected folder</p>
            <p className="break-all font-mono text-micro text-text-primary">{folderPath}</p>
          </div>
        ) : (
          <p className="text-micro text-text-muted">
            Default: <span className="font-mono">Documents/Cairn Backups</span>
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={pickFolder}
          loading={picking}
          className="self-start"
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
          {folderPath ? 'Change folder' : 'Choose folder'}
        </Button>
      </div>
    </OnboardingCard>
  )
}
