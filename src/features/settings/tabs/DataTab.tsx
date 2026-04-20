import { useState } from 'react'
import { FolderOpen, Download, Trash2 } from 'lucide-react'
import { ipc } from '../../../lib/ipc'
import { Button, Input } from '../../../components/ui'
import { useToast } from '../../../components/ui'

const RESET_ACK = 'DELETE ALL MY DATA'

export function DataTab() {
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  async function openFolder() {
    const res = await ipc.data.openFolder()
    if (!res.ok) toast(res.error.message, 'error')
  }

  async function exportData() {
    setExporting(true)
    const res = await ipc.data.export()
    if (res.ok) toast(`Exported to ${res.data}`, 'success')
    else toast(res.error.message, 'error')
    setExporting(false)
  }

  async function resetData() {
    if (resetConfirm !== RESET_ACK) return
    setResetting(true)
    const res = await ipc.data.reset(RESET_ACK)
    if (res.ok) {
      toast('All data deleted. The app will reload.', 'success')
      setTimeout(() => window.location.reload(), 1500)
    } else {
      toast(res.error.message, 'error')
    }
    setResetting(false)
  }

  return (
    <div className="max-w-md space-y-8">
      {/* Open folder */}
      <section className="space-y-2">
        <h3 className="text-body font-semibold text-text-primary">Data folder</h3>
        <p className="text-caption text-text-muted">
          Open the folder where your database and exports are stored. You can point your sync tool (Dropbox, iCloud, etc.) to this folder for automatic backup.
        </p>
        <Button variant="secondary" onClick={() => void openFolder()}>
          <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
          Open data folder
        </Button>
      </section>

      {/* Export */}
      <section className="space-y-2">
        <h3 className="text-body font-semibold text-text-primary">Export data</h3>
        <p className="text-caption text-text-muted">
          Export all data as a timestamped JSON file saved to your data folder. Includes every table.
        </p>
        <Button variant="secondary" onClick={() => void exportData()} loading={exporting}>
          <Download className="h-4 w-4" strokeWidth={1.5} />
          Export all data
        </Button>
      </section>

      {/* Reset */}
      <section className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <div className="space-y-1">
          <h3 className="text-body font-semibold text-red-400">Reset all data</h3>
          <p className="text-caption text-text-muted">
            Permanently deletes every trade, account, session, and setting. A backup copy of your database is saved first. This cannot be undone.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-caption text-text-secondary">
            Type <span className="font-mono font-semibold text-text-primary">{RESET_ACK}</span> to confirm.
          </p>
          <Input
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder={RESET_ACK}
          />
          <Button
            variant="destructive"
            disabled={resetConfirm !== RESET_ACK}
            loading={resetting}
            onClick={() => void resetData()}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            Reset all data
          </Button>
        </div>
      </section>
    </div>
  )
}
