import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import type { Playbook, CreatePlaybookInput, Pair, Setup, Killzone } from '@shared/types/index'
import { Button, Modal, Select, useToast } from '../../../components/ui'
import { cn } from '../../../lib/cn'
import { ipc } from '../../../lib/ipc'
import { useSessionStore } from '../../../stores/session-store'
import { INVALIDATION_CHIPS } from '../../pre-trade/constants/invalidation-chips'

// ─── Empty form ───────────────────────────────────────────────────────────────

interface FormState {
  name: string
  setupId: string
  pairId: string
  killzoneId: string
  defaultRiskPctStr: string // display string e.g. "1.5"
  defaultInvalidationChip: string // chip id or ""
  requiredConfluenceMd: string
}

const BLANK: FormState = {
  name: '',
  setupId: '',
  pairId: '',
  killzoneId: '',
  defaultRiskPctStr: '',
  defaultInvalidationChip: '',
  requiredConfluenceMd: '',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlaybooksTab() {
  const toast = useToast()
  const { selectedAccountId } = useSessionStore()

  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [setups, setSetups] = useState<Setup[]>([])
  const [killzones, setKillzones] = useState<Killzone[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const accountId = selectedAccountId

  const load = useCallback(async () => {
    if (!accountId) return
    const [pb, p, s, k] = await Promise.all([
      ipc.playbooks.list(accountId),
      ipc.pairs.list(),
      ipc.setups.list(),
      ipc.killzones.list(),
    ])
    if (pb.ok) setPlaybooks(pb.data)
    if (p.ok) setPairs(p.data.filter((x) => x.active === 1))
    if (s.ok) setSetups(s.data.filter((x) => x.active === 1))
    if (k.ok) setKillzones(k.data.filter((x) => x.active === 1))
  }, [accountId])

  useEffect(() => {
    void load()
  }, [load])

  const pairOptions = useMemo(
    () => [
      { value: '', label: 'Any pair' },
      ...pairs.map((p) => ({ value: p.id, label: `${p.symbol} — ${p.displayName}` })),
    ],
    [pairs],
  )

  const setupOptions = useMemo(() => setups.map((s) => ({ value: s.id, label: s.name })), [setups])

  const killzoneOptions = useMemo(
    () => [
      { value: '', label: 'Any killzone' },
      ...killzones.map((k) => ({ value: k.id, label: k.name })),
    ],
    [killzones],
  )

  const chipOptions = useMemo(
    () => [
      { value: '', label: 'None (free text)' },
      ...INVALIDATION_CHIPS.map((c) => ({ value: c.id, label: c.label })),
    ],
    [],
  )

  // ── Modal helpers ────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setModalOpen(true)
  }

  function openEdit(pb: Playbook) {
    setEditing(pb)
    setForm({
      name: pb.name,
      setupId: pb.setupId,
      pairId: pb.pairId ?? '',
      killzoneId: pb.killzoneId ?? '',
      defaultRiskPctStr: pb.defaultRiskPct !== null ? (pb.defaultRiskPct / 100).toFixed(2) : '',
      defaultInvalidationChip: pb.defaultInvalidationChip ?? '',
      requiredConfluenceMd: pb.requiredConfluenceMd ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!accountId) return
    if (!form.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    if (!form.setupId) {
      toast('Setup is required', 'error')
      return
    }

    const defaultRiskPct = form.defaultRiskPctStr
      ? Math.round(parseFloat(form.defaultRiskPctStr) * 100)
      : null

    if (form.defaultRiskPctStr && (Number.isNaN(defaultRiskPct) || (defaultRiskPct ?? 0) < 1)) {
      toast('Risk % must be a positive number (e.g. 1.5)', 'error')
      return
    }

    setSaving(true)
    let res
    if (editing) {
      res = await ipc.playbooks.update({
        id: editing.id,
        name: form.name.trim(),
        setupId: form.setupId,
        pairId: form.pairId || null,
        killzoneId: form.killzoneId || null,
        defaultRiskPct,
        defaultInvalidationChip: form.defaultInvalidationChip || null,
        requiredConfluenceMd: form.requiredConfluenceMd.trim() || null,
      })
    } else {
      const input: CreatePlaybookInput = {
        accountId,
        name: form.name.trim(),
        setupId: form.setupId,
        pairId: form.pairId || null,
        killzoneId: form.killzoneId || null,
        defaultRiskPct,
        defaultInvalidationChip: form.defaultInvalidationChip || null,
        requiredConfluenceMd: form.requiredConfluenceMd.trim() || null,
      }
      res = await ipc.playbooks.create(input)
    }
    setSaving(false)
    if (!res.ok) {
      toast(res.error.message, 'error')
      return
    }
    toast(editing ? 'Playbook updated.' : 'Playbook created.', 'success')
    setModalOpen(false)
    void load()
  }

  async function handleDelete(pb: Playbook) {
    setDeleting(pb.id)
    const res = await ipc.playbooks.delete(pb.id)
    setDeleting(null)
    if (!res.ok) {
      toast(res.error.message, 'error')
      return
    }
    toast('Playbook deleted.', 'success')
    void load()
  }

  // ── Helpers for displaying ────────────────────────────────────────────────

  const pairName = (id: string | null) => pairs.find((p) => p.id === id)?.symbol ?? 'Any pair'
  const setupName = (id: string) => setups.find((s) => s.id === id)?.name ?? id
  const kzName = (id: string | null) => killzones.find((k) => k.id === id)?.name ?? 'Any killzone'
  const chipName = (id: string | null) => INVALIDATION_CHIPS.find((c) => c.id === id)?.label ?? null

  if (!accountId) {
    return (
      <p className="text-body-sm text-text-muted">Select an account to manage its playbooks.</p>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-body font-semibold text-text-primary">Playbooks</h3>
          <p className="text-caption text-text-muted mt-0.5">
            Saved trade templates. One tap pre-fills the New Trade panel with your pair, setup,
            killzone, default risk %, and invalidation chip.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          New playbook
        </Button>
      </div>

      {playbooks.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-8 text-center">
          <p className="text-body-sm text-text-muted">No playbooks yet.</p>
          <p className="text-caption text-text-muted mt-1">
            Create one to pre-fill the New Trade panel in one tap.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {playbooks.map((pb) => (
            <div key={pb.id} className="glass rounded-[12px] p-4 flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-text-primary">{pb.name}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-text-muted">
                  <span>{pairName(pb.pairId)}</span>
                  <span>·</span>
                  <span>{setupName(pb.setupId)}</span>
                  <span>·</span>
                  <span>{kzName(pb.killzoneId)}</span>
                  {pb.defaultRiskPct !== null && (
                    <>
                      <span>·</span>
                      <span>{(pb.defaultRiskPct / 100).toFixed(2)}% risk</span>
                    </>
                  )}
                  {pb.defaultInvalidationChip && (
                    <>
                      <span>·</span>
                      <span className="italic">
                        {chipName(pb.defaultInvalidationChip) ?? pb.defaultInvalidationChip}
                      </span>
                    </>
                  )}
                </div>
                {pb.requiredConfluenceMd && (
                  <p className="mt-1.5 text-caption text-text-secondary line-clamp-2">
                    {pb.requiredConfluenceMd}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(pb)}
                  className="rounded-[8px] p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                  aria-label={`Edit ${pb.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(pb)}
                  disabled={deleting === pb.id}
                  className={cn(
                    'rounded-[8px] p-1.5 text-text-muted transition-colors',
                    deleting === pb.id
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-danger/10 hover:text-danger',
                  )}
                  aria-label={`Delete ${pb.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Create / edit modal ─────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit playbook — ${editing.name}` : 'New playbook'}
        maxWidth="520px"
      >
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. ICT FVG Long — London"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted focus:border-accent-a focus:outline-none"
            />
          </div>

          {/* Pair + Setup */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Pair (optional)"
              options={pairOptions}
              value={form.pairId}
              onChange={(v) => setForm((f) => ({ ...f, pairId: v }))}
              searchable
              placeholder="Any pair"
            />
            <Select
              label="Setup"
              options={setupOptions}
              value={form.setupId}
              onChange={(v) => setForm((f) => ({ ...f, setupId: v }))}
              placeholder="Select setup…"
            />
          </div>

          {/* Killzone + Risk */}
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Killzone (optional)"
              options={killzoneOptions}
              value={form.killzoneId}
              onChange={(v) => setForm((f) => ({ ...f, killzoneId: v }))}
            />
            <div className="space-y-1.5">
              <label className="text-caption font-medium text-text-secondary">
                Default risk % <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={form.defaultRiskPctStr}
                  onChange={(e) => setForm((f) => ({ ...f, defaultRiskPctStr: e.target.value }))}
                  placeholder="1.5"
                  className="w-full rounded-[10px] border border-border bg-surface-elevated py-2 pl-3 pr-8 font-mono text-body-sm text-text-primary placeholder:font-sans placeholder:text-text-muted focus:border-accent-a focus:outline-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-body-sm text-text-muted">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Invalidation chip */}
          <Select
            label="Default invalidation chip (optional)"
            options={chipOptions}
            value={form.defaultInvalidationChip}
            onChange={(v) => setForm((f) => ({ ...f, defaultInvalidationChip: v }))}
          />

          {/* Required confluence */}
          <div className="space-y-1.5">
            <label className="text-caption font-medium text-text-secondary">
              Required confluence notes{' '}
              <span className="font-normal text-text-muted">(optional, markdown)</span>
            </label>
            <textarea
              rows={3}
              value={form.requiredConfluenceMd}
              onChange={(e) => setForm((f) => ({ ...f, requiredConfluenceMd: e.target.value }))}
              placeholder="e.g. OB must be unmitigated. HTF FVG must be present. MSS on entry TF."
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted resize-y focus:border-accent-a focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            {editing ? 'Save changes' : 'Create playbook'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
