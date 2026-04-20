import { useEffect, useState, useMemo } from 'react'
import { Pencil, Trash2, Plus, Search } from 'lucide-react'
import { ipc } from '../../../lib/ipc'
import { Button, Modal, Input } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import type { PropFirm, CreatePropFirmInput } from '@shared/types/index'

const BLANK: CreatePropFirmInput = {
  name: '',
  defaultStepCount: 2,
}

export function PropFirmsTab() {
  const [firms, setFirms] = useState<PropFirm[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PropFirm | null>(null)
  const [editing, setEditing] = useState<PropFirm | null>(null)
  const [form, setForm] = useState<CreatePropFirmInput>(BLANK)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function load() {
    const res = await ipc.propFirms.list()
    if (res.ok) setFirms(res.data)
  }

  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return firms.filter((f) => !q || f.name.toLowerCase().includes(q))
  }, [firms, search])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setModalOpen(true)
  }

  function openEdit(firm: PropFirm) {
    setEditing(firm)
    setForm({
      name: firm.name,
      defaultStepCount: firm.defaultStepCount,
      ...(firm.notes != null ? { notes: firm.notes } : {}),
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name) { toast('Name is required', 'error'); return }
    setSaving(true)
    if (editing) {
      const res = await ipc.propFirms.update({
        id: editing.id,
        name: form.name,
        defaultStepCount: form.defaultStepCount,
        notes: form.notes ?? null,
      })
      if (res.ok) { toast('Firm updated', 'success'); await load() }
      else toast(res.error.message, 'error')
    } else {
      const res = await ipc.propFirms.create(form)
      if (res.ok) { toast('Firm created', 'success'); await load() }
      else toast(res.error.message, 'error')
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function handleDelete(firm: PropFirm) {
    const res = await ipc.propFirms.update({ id: firm.id, deletedAt: Date.now() })
    if (res.ok) { await load(); setDeleteTarget(null) }
    else toast(res.error.message, 'error')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search firms…"
            className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 pl-9 pr-3 text-body text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Add firm
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">Name</th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">Steps</th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">Notes</th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                  {search ? 'No firms match.' : 'No prop firms yet.'}
                </td>
              </tr>
            )}
            {visible.map((firm) => (
              <tr key={firm.id}>
                <td className="px-4 py-3 font-medium text-text-primary">{firm.name}</td>
                <td className="px-4 py-3 font-mono text-text-secondary">{firm.defaultStepCount}</td>
                <td className="px-4 py-3 text-text-muted max-w-xs truncate">{firm.notes ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => openEdit(firm)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => setDeleteTarget(firm)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
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
        title={editing ? `Edit ${editing.name}` : 'Add prop firm'}
        maxWidth="400px"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="My Prop Firm"
          />
          <Input
            label="Default step count"
            type="number"
            numeric
            value={String(form.defaultStepCount)}
            onChange={(e) => setForm({ ...form, defaultStepCount: Number(e.target.value) })}
            hint="Number of phases (1–5)"
          />
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
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editing ? 'Save changes' : 'Create firm'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete firm"
        maxWidth="400px"
      >
        <div className="space-y-4">
          <p className="text-body text-text-secondary">
            Delete <span className="font-medium text-text-primary">{deleteTarget?.name}</span>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && void handleDelete(deleteTarget)}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
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
