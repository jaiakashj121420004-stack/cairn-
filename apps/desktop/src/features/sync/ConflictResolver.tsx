import { AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ConflictDTO } from '@shared/types/index'
import { Button, Modal } from '../../components/ui'
import { ipc } from '../../lib/ipc'

/**
 * Sync conflict resolver (docs/sync-protocol.md §5).
 *
 * When two devices edit the same record concurrently, the pull engine keeps BOTH versions
 * in `sync_conflicts` and never silently picks a winner. This component surfaces a floating
 * badge whenever unresolved conflicts exist and opens a modal that shows the two versions
 * side by side; the user picks which device's version wins. The choice is written back
 * through the normal enqueue path (with the losing clock merged in) so it converges on the
 * next sync. The server is never consulted — it only ever held ciphertext (CLAUDE.md §2.4).
 */

const POLL_MS = 20_000

/** Human-friendly table labels (never expose raw table names as the only signal). */
const TABLE_LABELS: Record<string, string> = {
  trades: 'Trade',
  accounts: 'Account',
  sessions: 'Session',
  playbooks: 'Playbook',
  notebook_entries: 'Notebook entry',
  trade_partials: 'Partial close',
}

/** Columns that are pure bookkeeping — hide them from the diff to keep it readable. */
const NOISE_FIELDS = new Set(['createdAt', 'updatedAt', 'deletedAt', 'version'])

interface FieldDiff {
  readonly field: string
  readonly local: string
  readonly remote: string
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 60)}…` : value
  return JSON.stringify(value)
}

/** The fields whose values differ between the two versions (the actual conflict surface). */
function diffOf(
  local: Record<string, unknown> | null,
  remote: Record<string, unknown> | null,
): FieldDiff[] {
  const keys = new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])
  const out: FieldDiff[] = []
  for (const field of keys) {
    if (NOISE_FIELDS.has(field)) continue
    const l = local?.[field]
    const r = remote?.[field]
    if (JSON.stringify(l) !== JSON.stringify(r)) {
      out.push({ field, local: fmt(l), remote: fmt(r) })
    }
  }
  return out.sort((a, b) => a.field.localeCompare(b.field))
}

function labelFor(tableName: string): string {
  return TABLE_LABELS[tableName] ?? tableName
}

export function ConflictResolver() {
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictDTO[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshCount = useCallback(async () => {
    const res = await ipc.sync.countConflicts()
    if (res.ok) setCount(res.data)
  }, [])

  const refreshList = useCallback(async () => {
    const res = await ipc.sync.listConflicts()
    if (res.ok) {
      setConflicts(res.data)
      setCount(res.data.length)
    }
  }, [])

  useEffect(() => {
    void refreshCount()
    const id = window.setInterval(() => void refreshCount(), POLL_MS)
    const onFocus = (): void => void refreshCount()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCount])

  const openModal = useCallback(async () => {
    setError(null)
    await refreshList()
    setOpen(true)
  }, [refreshList])

  async function resolve(conflictId: number, winner: 'local' | 'remote'): Promise<void> {
    setBusyId(conflictId)
    setError(null)
    const res = await ipc.sync.resolveConflict({ conflictId, winner })
    setBusyId(null)
    if (!res.ok) {
      setError(
        res.error.code === 'SYNC_NOT_READY'
          ? 'Unlock your vault first, then resolve conflicts.'
          : 'Could not resolve that conflict. Try again.',
      )
      return
    }
    await refreshList()
  }

  // Close automatically once the queue is empty.
  useEffect(() => {
    if (open && conflicts.length === 0) setOpen(false)
  }, [open, conflicts.length])

  if (count === 0 && !open) return null

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          onClick={() => void openModal()}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-warning/50 bg-surface-elevated px-4 py-2 text-caption font-medium text-warning shadow-[0_8px_28px_rgba(0,0,0,0.5),0_0_22px_hsl(var(--warning)/0.22)] transition-[filter,box-shadow] hover:border-warning/70 hover:brightness-110"
        >
          <AlertTriangle className="h-4 w-4 drop-shadow-[0_0_6px_hsl(var(--warning)/0.6)]" />
          {count} sync conflict{count === 1 ? '' : 's'}
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Resolve sync conflicts"
        maxWidth="680px"
      >
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            These records were edited on two devices at the same time. Pick the version to keep —
            the other is preserved until you choose, and nothing is sent to the server.
          </p>
          {error && <p className="text-caption text-danger">{error}</p>}

          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {conflicts.map((c) => {
              const diffs = diffOf(c.localData, c.remoteData)
              return (
                <div key={c.id} className="rounded-lg border border-border bg-surface/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-body font-semibold text-text-primary">
                      {labelFor(c.tableName)}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      {c.recordId.slice(0, 8)}
                    </span>
                  </div>

                  {diffs.length === 0 ? (
                    <p className="text-caption text-text-muted">
                      The two versions differ only in metadata.
                    </p>
                  ) : (
                    <div className="mb-3 overflow-hidden rounded-md border border-border/60">
                      <div className="grid grid-cols-[1fr_1fr_1fr] bg-surface px-2 py-1 text-[11px] font-medium text-text-muted">
                        <span>Field</span>
                        <span>This device</span>
                        <span>Other device</span>
                      </div>
                      {diffs.slice(0, 8).map((d) => (
                        <div
                          key={d.field}
                          className="grid grid-cols-[1fr_1fr_1fr] gap-1 px-2 py-1 text-[12px] text-text-secondary odd:bg-surface/40"
                        >
                          <span className="font-mono text-text-primary">{d.field}</span>
                          <span className="truncate" title={d.local}>
                            {d.local}
                          </span>
                          <span className="truncate" title={d.remote}>
                            {d.remote}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyId === c.id}
                      onClick={() => void resolve(c.id, 'local')}
                    >
                      Keep this device
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyId === c.id}
                      onClick={() => void resolve(c.id, 'remote')}
                    >
                      Use other device
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>
    </>
  )
}
