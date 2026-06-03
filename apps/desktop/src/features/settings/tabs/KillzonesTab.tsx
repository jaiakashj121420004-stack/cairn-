import { ChevronUp, ChevronDown, Pencil, Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import type { Killzone, CreateKillzoneInput } from '@shared/types/index'
import { Button, Badge, Modal, Input } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'

const BLANK: CreateKillzoneInput = {
  name: '',
  startTimeUtc: '00:00',
  endTimeUtc: '05:00',
  color: '#6B9FFF',
}

export function KillzonesTab() {
  const [killzones, setKillzones] = useState<Killzone[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Killzone | null>(null)
  const [form, setForm] = useState<CreateKillzoneInput>(BLANK)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function load() {
    const res = await ipc.killzones.list()
    if (res.ok) setKillzones(res.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(() => {
    return killzones
      .filter((k) => (showArchived ? true : k.active === 1))
      .filter((k) => {
        const q = search.toLowerCase()
        return !q || k.name.toLowerCase().includes(q)
      })
  }, [killzones, showArchived, search])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setModalOpen(true)
  }

  function openEdit(kz: Killzone) {
    setEditing(kz)
    setForm({
      name: kz.name,
      startTimeUtc: kz.startTimeUtc,
      endTimeUtc: kz.endTimeUtc,
      color: kz.color,
      ...(kz.notes != null ? { notes: kz.notes } : {}),
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name) {
      toast('Name is required', 'error')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(form.startTimeUtc) || !/^\d{2}:\d{2}$/.test(form.endTimeUtc)) {
      toast('Times must be in HH:MM format', 'error')
      return
    }
    setSaving(true)
    if (editing) {
      const res = await ipc.killzones.update({
        id: editing.id,
        name: form.name,
        startTimeUtc: form.startTimeUtc,
        endTimeUtc: form.endTimeUtc,
        color: form.color,
        notes: form.notes ?? null,
      })
      if (res.ok) {
        toast('Killzone updated', 'success')
        await load()
      } else toast(res.error.message, 'error')
    } else {
      const res = await ipc.killzones.create(form)
      if (res.ok) {
        toast('Killzone created', 'success')
        await load()
      } else toast(res.error.message, 'error')
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function toggleArchive(kz: Killzone) {
    const res = await ipc.killzones.update({ id: kz.id, active: kz.active === 1 ? false : true })
    if (res.ok) await load()
    else toast(res.error.message, 'error')
  }

  async function moveOrder(kz: Killzone, dir: -1 | 1) {
    const sorted = [...killzones].sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sorted.findIndex((k) => k.id === kz.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    await Promise.all([
      ipc.killzones.update({ id: kz.id, displayOrder: swapWith.displayOrder }),
      ipc.killzones.update({ id: swapWith.id, displayOrder: kz.displayOrder }),
    ])
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            strokeWidth={1.5}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search killzones…"
            className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 pl-9 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-caption text-text-muted underline-offset-2 hover:text-text-secondary hover:underline"
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add killzone
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted w-6"></th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Name
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Start (UTC)
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                End (UTC)
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Notes
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                  {search ? 'No killzones match.' : 'No killzones yet.'}
                </td>
              </tr>
            )}
            {visible.map((kz) => (
              <tr key={kz.id} className={kz.active === 0 ? 'opacity-50' : ''}>
                <td className="pl-4 py-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: kz.color }} />
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {kz.name}
                  {kz.active === 0 && (
                    <Badge variant="neutral" className="ml-2">
                      archived
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-text-secondary">{kz.startTimeUtc}</td>
                <td className="px-4 py-3 font-mono text-text-secondary">{kz.endTimeUtc}</td>
                <td className="px-4 py-3 text-text-muted max-w-xs truncate">{kz.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => void moveOrder(kz, -1)} title="Move up">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => void moveOrder(kz, 1)} title="Move down">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => openEdit(kz)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => void toggleArchive(kz)}
                      title={kz.active === 1 ? 'Archive' : 'Restore'}
                    >
                      {kz.active === 1 ? (
                        <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add killzone'}
        maxWidth="440px"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="London"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start time (UTC)"
              value={form.startTimeUtc}
              onChange={(e) => setForm({ ...form, startTimeUtc: e.target.value })}
              placeholder="07:00"
              hint="HH:MM format"
            />
            <Input
              label="End time (UTC)"
              value={form.endTimeUtc}
              onChange={(e) => setForm({ ...form, endTimeUtc: e.target.value })}
              placeholder="10:00"
              hint="HH:MM format"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-text-secondary">Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded-[8px] border border-border bg-transparent p-0.5"
              />
              <span className="font-mono text-caption text-text-muted">{form.color}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-text-secondary">Notes</label>
            <textarea
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editing ? 'Save changes' : 'Create killzone'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-[8px] p-1 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
    >
      {children}
    </button>
  )
}
