import { ChevronUp, ChevronDown, Pencil, Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import type { Setup, CreateSetupInput } from '@shared/types/index'
import { Button, Badge, Modal, Input } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'

const BLANK: CreateSetupInput = {
  name: '',
  category: 'ICT',
  description: '',
  color: '#D4A24C',
}

export function SetupsTab() {
  const [setups, setSetups] = useState<Setup[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Setup | null>(null)
  const [form, setForm] = useState<CreateSetupInput>(BLANK)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function load() {
    const res = await ipc.setups.list()
    if (res.ok) setSetups(res.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(() => {
    return setups
      .filter((s) => (showArchived ? true : s.active === 1))
      .filter((s) => {
        const q = search.toLowerCase()
        return !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)
      })
  }, [setups, showArchived, search])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setModalOpen(true)
  }

  function openEdit(setup: Setup) {
    setEditing(setup)
    setForm({
      name: setup.name,
      category: setup.category,
      description: setup.description ?? '',
      color: setup.color,
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name) {
      toast('Name is required', 'error')
      return
    }
    setSaving(true)
    if (editing) {
      const res = await ipc.setups.update({
        id: editing.id,
        name: form.name,
        category: form.category,
        description: form.description || null,
        color: form.color,
      })
      if (res.ok) {
        toast('Setup updated', 'success')
        await load()
      } else toast(res.error.message, 'error')
    } else {
      const res = await ipc.setups.create(form)
      if (res.ok) {
        toast('Setup created', 'success')
        await load()
      } else toast(res.error.message, 'error')
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function toggleArchive(setup: Setup) {
    const res = await ipc.setups.update({ id: setup.id, active: setup.active === 1 ? false : true })
    if (res.ok) await load()
    else toast(res.error.message, 'error')
  }

  async function moveOrder(setup: Setup, dir: -1 | 1) {
    const sorted = [...setups].sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sorted.findIndex((s) => s.id === setup.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    await Promise.all([
      ipc.setups.update({ id: setup.id, displayOrder: swapWith.displayOrder }),
      ipc.setups.update({ id: swapWith.id, displayOrder: setup.displayOrder }),
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
            placeholder="Search setups…"
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
            Add setup
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
                Category
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Description
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  {search ? 'No setups match your search.' : 'No setups yet.'}
                </td>
              </tr>
            )}
            {visible.map((setup) => (
              <tr key={setup.id} className={setup.active === 0 ? 'opacity-50' : ''}>
                <td className="pl-4 py-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: setup.color }} />
                </td>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {setup.name}
                  {setup.active === 0 && (
                    <Badge variant="neutral" className="ml-2">
                      archived
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted">{setup.category}</td>
                <td className="px-4 py-3 text-text-muted max-w-xs truncate">
                  {setup.description ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => void moveOrder(setup, -1)} title="Move up">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => void moveOrder(setup, 1)} title="Move down">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => openEdit(setup)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => void toggleArchive(setup)}
                      title={setup.active === 1 ? 'Archive' : 'Restore'}
                    >
                      {setup.active === 1 ? (
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
        title={editing ? `Edit ${editing.name}` : 'Add setup'}
        maxWidth="480px"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="FVG"
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="ICT"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-text-secondary">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of this setup…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editing ? 'Save changes' : 'Create setup'}
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
