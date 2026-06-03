import { FolderOpen, Archive, RotateCcw, CheckCircle, XCircle } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import type { BackupLogEntry, BackupSettings, RestoreInfo } from '@shared/types/index'
import { Button, Input, Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { Modal } from '../../../components/ui/Modal'
import { Switch } from '../../../components/ui/switch'
import { cn } from '../../../lib/cn'
import { formatDate, formatTimestamp } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'

const SCHEDULE_OPTIONS = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily (automatic)' },
  { value: 'on_close', label: 'On app close' },
]

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function BackupsTab() {
  const toast = useToast()
  const [settings, setSettings] = useState<BackupSettings>({
    folder: null,
    schedule: 'manual',
    dailyTime: '02:00',
    backupOnClose: false,
  })
  const [log, setLog] = useState<BackupLogEntry[]>([])
  const [savingSettings, setSavingSettings] = useState(false)
  const [backingUp, setBackingUp] = useState(false)

  // Restore modal state
  const [restoreInfo, setRestoreInfo] = useState<(RestoreInfo & { path: string }) | null>(null)
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoring, setRestoring] = useState(false)

  const loadLog = useCallback(async () => {
    const r = await ipc.backup.getLog()
    if (r.ok) setLog(r.data)
  }, [])

  useEffect(() => {
    void ipc.backup.getSettings().then((r) => r.ok && setSettings(r.data))
    void loadLog()
  }, [loadLog])

  async function saveSettings(patch: Partial<BackupSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    setSavingSettings(true)
    const r = await ipc.backup.setSettings(patch)
    if (!r.ok) toast(r.error.message, 'error')
    else await ipc.backup.reschedule()
    setSavingSettings(false)
  }

  async function pickFolder() {
    const r = await ipc.backup.pickFolder()
    if (!r.ok) {
      toast(r.error.message, 'error')
      return
    }
    if (r.data) await saveSettings({ folder: r.data })
  }

  async function backupNow() {
    setBackingUp(true)
    const r = settings.folder ? await ipc.backup.now() : await ipc.backup.nowToFolder()
    if (r.ok) {
      toast(`Backup saved — ${fileSizeLabel(r.data.filesizeBytes)}`, 'success')
      void loadLog()
    } else if (r.error.code !== 'CANCELLED') {
      toast(r.error.message, 'error')
    }
    setBackingUp(false)
  }

  async function pickRestore() {
    const r = await ipc.backup.pickRestoreFile()
    if (!r.ok) {
      if (r.error.code !== 'CANCELLED') toast(r.error.message, 'error')
      return
    }
    setRestoreInfo(r.data)
    setRestoreConfirm('')
  }

  async function confirmRestore() {
    if (!restoreInfo || restoreConfirm !== 'RESTORE') return
    setRestoring(true)
    const r = await ipc.backup.restore(restoreInfo.path, 'RESTORE')
    if (!r.ok) {
      toast(r.error.message, 'error')
      setRestoring(false)
    }
    // On success the app relaunches — no further state update needed
  }

  const restoreModalOpen = restoreInfo !== null

  return (
    <div className="max-w-xl space-y-8">
      {/* Backup folder */}
      <section className="space-y-3">
        <h3 className="text-body font-semibold text-text-primary">Backup folder</h3>
        <p className="text-caption text-text-muted">
          Where backup ZIP files are saved. Point this to a cloud-synced folder (Dropbox, iCloud,
          etc.) for automatic off-device backup.
        </p>
        <div className="flex items-center gap-2">
          <p className="flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-body-sm text-text-secondary">
            {settings.folder ?? 'Default (local backups folder)'}
          </p>
          <Button variant="secondary" onClick={() => void pickFolder()}>
            <FolderOpen size={14} strokeWidth={1.5} />
            Change
          </Button>
        </div>
      </section>

      {/* Schedule */}
      <section className="space-y-3">
        <h3 className="text-body font-semibold text-text-primary">Backup schedule</h3>
        <Select
          label="When to back up automatically"
          options={SCHEDULE_OPTIONS}
          value={settings.schedule}
          onChange={(v) => void saveSettings({ schedule: v as BackupSettings['schedule'] })}
        />
        {settings.schedule === 'daily' && (
          <Input
            label="Daily backup time (UTC)"
            type="time"
            value={settings.dailyTime}
            onChange={(e) => void saveSettings({ dailyTime: e.target.value })}
          />
        )}
        <div className="flex items-center gap-2">
          <Switch
            checked={settings.backupOnClose}
            onChange={(c) => void saveSettings({ backupOnClose: c })}
          />
          <span className="text-body-sm text-text-secondary">
            Also back up when closing the app
          </span>
        </div>
        {savingSettings && <p className="text-caption text-text-muted">Saving…</p>}
      </section>

      {/* Manual backup now */}
      <section className="space-y-2">
        <h3 className="text-body font-semibold text-text-primary">Manual backup</h3>
        <p className="text-caption text-text-muted">
          Creates a ZIP containing your database, screenshots, and exports.
          {settings.folder
            ? ' Saved to your configured folder.'
            : ' You will pick the destination folder.'}
        </p>
        <Button variant="secondary" loading={backingUp} onClick={() => void backupNow()}>
          <Archive size={14} strokeWidth={1.5} />
          Back up now
        </Button>
      </section>

      {/* Restore */}
      <section className="space-y-2 rounded-xl border border-warning/30 bg-warning/5 p-4">
        <h3 className="text-body font-semibold text-warning">Restore from backup</h3>
        <p className="text-caption text-text-muted">
          Select a Cairn backup ZIP. Your current data will be replaced and the app will restart. A
          safety copy of your current data is saved automatically first.
        </p>
        <Button variant="secondary" onClick={() => void pickRestore()}>
          <RotateCcw size={14} strokeWidth={1.5} />
          Select backup file…
        </Button>
      </section>

      {/* Backup log */}
      {log.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-body font-semibold text-text-primary">Backup log</h3>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-body-sm">
              <thead className="sticky top-0 bg-surface-elevated text-left text-caption uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2 text-right">Size</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-text-secondary">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="px-3 py-2 capitalize text-text-secondary">
                      {entry.kind.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-text-muted">
                      {entry.filesizeBytes > 0 ? fileSizeLabel(entry.filesizeBytes) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {entry.status === 'success' ? (
                        <span className="flex items-center gap-1 text-accent-a">
                          <CheckCircle size={12} /> OK
                        </span>
                      ) : (
                        <span
                          className={cn('flex items-center gap-1 text-danger')}
                          title={entry.errorMessage ?? undefined}
                        >
                          <XCircle size={12} /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Restore confirmation modal */}
      <Modal
        open={restoreModalOpen}
        onClose={() => {
          setRestoreInfo(null)
          setRestoreConfirm('')
        }}
        title="Confirm restore"
        maxWidth="480px"
      >
        {restoreInfo && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-surface p-3 font-mono text-body-sm text-text-secondary space-y-1">
              <p>
                Version: <span className="text-text-primary">{restoreInfo.version}</span>
              </p>
              <p>
                Created:{' '}
                <span className="text-text-primary">{formatTimestamp(restoreInfo.createdAt)}</span>
              </p>
              <p>
                Trades: <span className="text-text-primary">{restoreInfo.tradeCount}</span>
              </p>
              <p>
                Accounts: <span className="text-text-primary">{restoreInfo.accountCount}</span>
              </p>
            </div>
            <p className="text-caption text-danger">
              This will permanently replace your current database. A pre-restore backup is saved
              automatically. The app will restart.
            </p>
            <div className="space-y-2">
              <p className="text-caption text-text-secondary">
                Type <span className="font-mono font-semibold text-text-primary">RESTORE</span> to
                confirm.
              </p>
              <Input
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                placeholder="RESTORE"
              />
              <Button
                variant="destructive"
                disabled={restoreConfirm !== 'RESTORE'}
                loading={restoring}
                onClick={() => void confirmRestore()}
              >
                Restore and restart
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

void formatTimestamp
