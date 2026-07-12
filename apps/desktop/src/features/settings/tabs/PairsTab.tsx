import { ChevronUp, ChevronDown, Pencil, Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import type { Pair, CreatePairInput } from '@shared/types/index'
import { Button, Badge, Modal, Input, Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ASSET_CLASSES, assetClassConfig } from '../../../lib/asset-class'
import { ipc } from '../../../lib/ipc'

const ASSET_CLASS_OPTIONS = ASSET_CLASSES.map((a) => ({ value: a.value, label: a.label }))

const BLANK: CreatePairInput = {
  symbol: '',
  displayName: '',
  assetClass: 'forex',
  pipDecimal: 4,
  pipValuePerStandardLotCents: 1000,
}

export function PairsTab() {
  const [pairs, setPairs] = useState<Pair[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Pair | null>(null)
  const [form, setForm] = useState<CreatePairInput>(BLANK)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function load() {
    const res = await ipc.pairs.list()
    if (res.ok) setPairs(res.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = useMemo(() => {
    return pairs
      .filter((p) => (showArchived ? true : p.active === 1))
      .filter((p) => {
        const q = search.toLowerCase()
        return !q || p.symbol.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q)
      })
  }, [pairs, showArchived, search])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setModalOpen(true)
  }

  function openEdit(pair: Pair) {
    setEditing(pair)
    setForm({
      symbol: pair.symbol,
      displayName: pair.displayName,
      assetClass: pair.assetClass as CreatePairInput['assetClass'],
      pipDecimal: pair.pipDecimal,
      pipValuePerStandardLotCents: pair.pipValuePerStandardLotCents,
      ...(pair.correlatedWith
        ? { correlatedWith: JSON.parse(pair.correlatedWith) as string[] }
        : {}),
      ...(pair.notes != null ? { notes: pair.notes } : {}),
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.symbol || !form.displayName) {
      toast('Symbol and display name are required', 'error')
      return
    }
    setSaving(true)
    if (editing) {
      const res = await ipc.pairs.update({
        id: editing.id,
        symbol: form.symbol,
        displayName: form.displayName,
        assetClass: form.assetClass,
        pipDecimal: form.pipDecimal,
        pipValuePerStandardLotCents: form.pipValuePerStandardLotCents,
        notes: form.notes ?? null,
      })
      if (res.ok) {
        toast('Pair updated', 'success')
        await load()
      } else toast(res.error.message, 'error')
    } else {
      const res = await ipc.pairs.create(form)
      if (res.ok) {
        toast('Pair created', 'success')
        await load()
      } else toast(res.error.message, 'error')
    }
    setSaving(false)
    setModalOpen(false)
  }

  async function toggleArchive(pair: Pair) {
    const res = await ipc.pairs.update({ id: pair.id, active: pair.active === 1 ? false : true })
    if (res.ok) await load()
    else toast(res.error.message, 'error')
  }

  async function moveOrder(pair: Pair, dir: -1 | 1) {
    const sorted = [...pairs].sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sorted.findIndex((p) => p.id === pair.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    await Promise.all([
      ipc.pairs.update({ id: pair.id, displayOrder: swapWith.displayOrder }),
      ipc.pairs.update({ id: swapWith.id, displayOrder: pair.displayOrder }),
    ])
    await load()
  }

  const unitTerm = assetClassConfig(form.assetClass).unitTerm
  const unitTermLabel = unitTerm === 'pip' ? 'Pip' : 'Point'

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
            placeholder="Search pairs…"
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
            Add pair
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Symbol
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Display name
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Class
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Pip decimal
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Pip value
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
                  {search ? 'No pairs match your search.' : 'No pairs yet.'}
                </td>
              </tr>
            )}
            {visible.map((pair) => (
              <tr key={pair.id} className={pair.active === 0 ? 'opacity-50' : ''}>
                <td className="px-4 py-3 font-mono font-semibold text-text-primary">
                  {pair.symbol}
                  {pair.active === 0 && (
                    <Badge variant="neutral" className="ml-2">
                      archived
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">{pair.displayName}</td>
                <td className="px-4 py-3 text-text-muted">{pair.assetClass}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {pair.pipDecimal}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  ${(pair.pipValuePerStandardLotCents / 100).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => void moveOrder(pair, -1)} title="Move up">
                      <ChevronUp className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => void moveOrder(pair, 1)} title="Move down">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn onClick={() => openEdit(pair)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => void toggleArchive(pair)}
                      title={pair.active === 1 ? 'Archive' : 'Restore'}
                    >
                      {pair.active === 1 ? (
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
        title={editing ? `Edit ${editing.symbol}` : 'Add pair'}
        maxWidth="480px"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Symbol"
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              placeholder="EURUSD"
              hint="Uppercase, no spaces"
            />
            <Input
              label="Display name"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="EUR/USD"
            />
          </div>
          <Select
            label="Asset class"
            options={ASSET_CLASS_OPTIONS}
            value={form.assetClass}
            onChange={(v) => {
              const assetClass = v as CreatePairInput['assetClass']
              // Prefill sensible decimals/value for the class when creating a new
              // pair; when editing, never clobber the user's saved numbers.
              if (editing) {
                setForm((f) => ({ ...f, assetClass }))
                return
              }
              const cfg = assetClassConfig(assetClass)
              setForm((f) => ({
                ...f,
                assetClass,
                pipDecimal: cfg.pipDecimalDefault,
                pipValuePerStandardLotCents: cfg.pipValueDefaultCents,
              }))
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={`${unitTermLabel} decimal`}
              type="number"
              numeric
              value={String(form.pipDecimal)}
              onChange={(e) => setForm({ ...form, pipDecimal: Number(e.target.value) })}
              hint={`Decimals that equal 1 ${unitTerm}`}
            />
            <Input
              label={`${unitTermLabel} value (cents)`}
              type="number"
              numeric
              value={String(form.pipValuePerStandardLotCents)}
              onChange={(e) =>
                setForm({ ...form, pipValuePerStandardLotCents: Number(e.target.value) })
              }
              hint="Per standard lot"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              {editing ? 'Save changes' : 'Create pair'}
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
