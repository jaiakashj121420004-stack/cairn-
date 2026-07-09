import { Pencil, Archive, ArchiveRestore, Plus, Search } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import type { AccountTemplate, PropFirm, DrawdownType, DrawdownBasis } from '@shared/types/index'
import {
  blankPhaseRow,
  PhaseRulesFields,
  phaseRowsToInputs,
  resizePhaseRows,
} from '../../../components/shared/PhaseRulesFields'
import { Button, Badge, Modal, Input, Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'
import type { PhaseFieldsRow } from '../../../components/shared/PhaseRulesFields'

const DD_TYPE_OPTIONS = [
  { value: 'percent_of_balance', label: '% of balance' },
  { value: 'percent_of_equity', label: '% of equity' },
  { value: 'fixed_amount', label: 'Fixed amount' },
]

const DD_BASIS_OPTIONS = [
  { value: 'initial_balance', label: 'Initial balance' },
  { value: 'high_water_mark', label: 'High water mark' },
  { value: 'previous_day_close', label: 'Previous day close' },
]

type CreateForm = {
  name: string
  propFirmId: string
  stepCount: string
  accountSizeStr: string
  leverage: string
  dailyDrawdownType: DrawdownType
  totalDrawdownType: DrawdownType
  drawdownBasis: DrawdownBasis
  phaseRows: PhaseFieldsRow[]
  notes: string
  weekendHoldingAllowed: boolean
  newsTradingAllowed: boolean
}

function makeBlank(propFirmId: string): CreateForm {
  return {
    name: '',
    propFirmId,
    stepCount: '2',
    accountSizeStr: '10000',
    leverage: '100',
    dailyDrawdownType: 'percent_of_balance',
    totalDrawdownType: 'percent_of_balance',
    drawdownBasis: 'initial_balance',
    phaseRows: resizePhaseRows([blankPhaseRow({ target: '10', daily: '4', total: '8' })], 2),
    notes: '',
    weekendHoldingAllowed: false,
    newsTradingAllowed: false,
  }
}

export function TemplatesTab() {
  const [templates, setTemplates] = useState<AccountTemplate[]>([])
  const [firms, setFirms] = useState<PropFirm[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AccountTemplate | null>(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editSteps, setEditSteps] = useState('2')
  const [editSize, setEditSize] = useState('10000')
  const [editLeverage, setEditLeverage] = useState('100')
  const [editDailyDd, setEditDailyDd] = useState('4')
  const [editTotalDd, setEditTotalDd] = useState('8')
  const [editTarget1, setEditTarget1] = useState('10')
  const [editTarget2, setEditTarget2] = useState('')
  const [editTarget3, setEditTarget3] = useState('')
  const [editDdType, setEditDdType] = useState<DrawdownType>('percent_of_balance')
  const [editDdBasis, setEditDdBasis] = useState<DrawdownBasis>('initial_balance')
  const [form, setForm] = useState<CreateForm>(makeBlank(''))
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function load() {
    const [tr, fr] = await Promise.all([ipc.accountTemplates.list(), ipc.propFirms.list()])
    if (tr.ok) setTemplates(tr.data)
    if (fr.ok) setFirms(fr.data)
  }

  useEffect(() => {
    void load()
  }, [])

  const firmMap = useMemo(() => {
    const m = new Map<string, string>()
    firms.forEach((f) => m.set(f.id, f.name))
    return m
  }, [firms])

  const firmOptions = useMemo(() => firms.map((f) => ({ value: f.id, label: f.name })), [firms])

  const visible = useMemo(() => {
    return templates
      .filter((t) => (showArchived ? true : t.isArchived === 0))
      .filter((t) => {
        const q = search.toLowerCase()
        return !q || t.name.toLowerCase().includes(q)
      })
  }, [templates, showArchived, search])

  function openCreate() {
    const firstFirmId = firms[0]?.id ?? ''
    setForm(makeBlank(firstFirmId))
    setCreateOpen(true)
  }

  function openEdit(tmpl: AccountTemplate) {
    setEditTarget(tmpl)
    setEditName(tmpl.name)
    setEditNotes(tmpl.notes ?? '')
    setEditSteps(String(tmpl.stepCount))
    setEditSize(String(tmpl.accountSizeCents / 100))
    setEditLeverage(String(tmpl.leverage))
    setEditDailyDd(String(tmpl.dailyDrawdownValue / 100))
    setEditTotalDd(String(tmpl.totalDrawdownValue / 100))
    setEditTarget1(String(tmpl.profitTargetPhase1Pct / 100))
    setEditTarget2(
      tmpl.profitTargetPhase2Pct === null ? '' : String(tmpl.profitTargetPhase2Pct / 100),
    )
    setEditTarget3(
      tmpl.profitTargetPhase3Pct === null ? '' : String(tmpl.profitTargetPhase3Pct / 100),
    )
    setEditDdType(tmpl.dailyDrawdownType)
    setEditDdBasis(tmpl.drawdownBasis)
  }

  async function handleCreate() {
    if (!form.name) {
      toast('Name is required', 'error')
      return
    }
    if (!form.propFirmId) {
      toast('Select a prop firm', 'error')
      return
    }
    const stepCountNum = parseInt(form.stepCount, 10)
    if (!Number.isInteger(stepCountNum) || stepCountNum < 1 || stepCountNum > 5) {
      toast('Steps must be between 1 and 5', 'error')
      return
    }
    const rows = resizePhaseRows(form.phaseRows, stepCountNum)
    const converted = phaseRowsToInputs(rows, form.dailyDrawdownType, form.totalDrawdownType)
    if (!converted.ok) {
      toast(converted.error, 'error')
      return
    }
    // Templates keep the flat phase-1..3 target columns + a single drawdown set
    // (from Phase 1). Accounts are the source of truth for full per-phase config.
    const [p1, p2, p3] = converted.phases
    if (!p1 || p1.profitTargetPct === null) {
      toast('Phase 1 needs a profit target', 'error')
      return
    }
    setSaving(true)
    const res = await ipc.accountTemplates.create({
      name: form.name,
      propFirmId: form.propFirmId,
      stepCount: stepCountNum,
      accountSizeCents: Math.round(Number(form.accountSizeStr) * 100),
      leverage: Number(form.leverage),
      dailyDrawdownType: form.dailyDrawdownType,
      dailyDrawdownValue: p1.dailyDrawdownValue,
      totalDrawdownType: form.totalDrawdownType,
      totalDrawdownValue: p1.totalDrawdownValue,
      drawdownBasis: form.drawdownBasis,
      profitTargetPhase1Pct: p1.profitTargetPct,
      ...(p2 && p2.profitTargetPct !== null ? { profitTargetPhase2Pct: p2.profitTargetPct } : {}),
      ...(p3 && p3.profitTargetPct !== null ? { profitTargetPhase3Pct: p3.profitTargetPct } : {}),
      weekendHoldingAllowed: form.weekendHoldingAllowed,
      newsTradingAllowed: form.newsTradingAllowed,
      ...(form.notes ? { notes: form.notes } : {}),
    })
    if (res.ok) {
      toast('Template created', 'success')
      await load()
      setCreateOpen(false)
    } else toast(res.error.message, 'error')
    setSaving(false)
  }

  async function handleEditSave() {
    if (!editTarget) return
    const stepsNum = parseInt(editSteps, 10)
    const sizeNum = Number(editSize)
    const levNum = parseInt(editLeverage, 10)
    const dailyNum = Number(editDailyDd)
    const totalNum = Number(editTotalDd)
    const t1Num = Number(editTarget1)
    const t2Num = editTarget2.trim() === '' ? 0 : Number(editTarget2)
    const t3Num = editTarget3.trim() === '' ? 0 : Number(editTarget3)
    setSaving(true)
    const res = await ipc.accountTemplates.update({
      id: editTarget.id,
      ...(editName ? { name: editName } : {}),
      notes: editNotes || null,
      ...(Number.isInteger(stepsNum) && stepsNum >= 1 && stepsNum <= 5
        ? { stepCount: stepsNum }
        : {}),
      ...(Number.isFinite(sizeNum) && sizeNum > 0
        ? { accountSizeCents: Math.round(sizeNum * 100) }
        : {}),
      ...(Number.isInteger(levNum) && levNum >= 1 && levNum <= 3000 ? { leverage: levNum } : {}),
      ...(Number.isFinite(dailyNum) && dailyNum > 0
        ? { dailyDrawdownValue: Math.round(dailyNum * 100) }
        : {}),
      ...(Number.isFinite(totalNum) && totalNum > 0
        ? { totalDrawdownValue: Math.round(totalNum * 100) }
        : {}),
      dailyDrawdownType: editDdType,
      drawdownBasis: editDdBasis,
      ...(Number.isFinite(t1Num) && t1Num > 0
        ? { profitTargetPhase1Pct: Math.round(t1Num * 100) }
        : {}),
      profitTargetPhase2Pct: Number.isFinite(t2Num) && t2Num > 0 ? Math.round(t2Num * 100) : null,
      profitTargetPhase3Pct: Number.isFinite(t3Num) && t3Num > 0 ? Math.round(t3Num * 100) : null,
    })
    if (res.ok) {
      toast('Template updated', 'success')
      await load()
      setEditTarget(null)
    } else toast(res.error.message, 'error')
    setSaving(false)
  }

  async function toggleArchive(tmpl: AccountTemplate) {
    const res = await ipc.accountTemplates.update({
      id: tmpl.id,
      isArchived: tmpl.isArchived !== 1,
    })
    if (res.ok) await load()
    else toast(res.error.message, 'error')
  }

  function fmtSize(cents: number) {
    return `$${(cents / 100).toLocaleString()}`
  }

  function fmtBps(bps: number) {
    return `${(bps / 100).toFixed(1)}%`
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
            placeholder="Search templates…"
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
          <Button size="sm" onClick={openCreate} disabled={firms.length === 0}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add template
          </Button>
        </div>
      </div>

      {firms.length === 0 && (
        <p className="text-caption text-text-muted">
          Add a prop firm first before creating templates.
        </p>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Name
              </th>
              <th className="px-4 py-2.5 text-left text-caption font-medium text-text-muted">
                Firm
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Size
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Daily DD
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Total DD
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted">
                Target
              </th>
              <th className="px-4 py-2.5 text-right text-caption font-medium text-text-muted w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  {search ? 'No templates match.' : 'No templates yet.'}
                </td>
              </tr>
            )}
            {visible.map((tmpl) => (
              <tr key={tmpl.id} className={tmpl.isArchived === 1 ? 'opacity-50' : ''}>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {tmpl.name}
                  {tmpl.isArchived === 1 && (
                    <Badge variant="neutral" className="ml-2">
                      archived
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-text-muted">{firmMap.get(tmpl.propFirmId) ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {fmtSize(tmpl.accountSizeCents)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {fmtBps(tmpl.dailyDrawdownValue)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {fmtBps(tmpl.totalDrawdownValue)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-text-secondary">
                  {fmtBps(tmpl.profitTargetPhase1Pct)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn onClick={() => openEdit(tmpl)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => void toggleArchive(tmpl)}
                      title={tmpl.isArchived === 1 ? 'Restore' : 'Archive'}
                    >
                      {tmpl.isArchived === 1 ? (
                        <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.5} />
                      ) : (
                        <Archive className="h-3.5 w-3.5" strokeWidth={1.5} />
                      )}
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add template"
        maxWidth="540px"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="2-Step — 10k"
            />
            <Input
              label="Steps"
              type="number"
              numeric
              value={form.stepCount}
              onChange={(e) => {
                const v = e.target.value
                const n = parseInt(v, 10)
                setForm((f) => ({
                  ...f,
                  stepCount: v,
                  phaseRows:
                    Number.isInteger(n) && n >= 1 && n <= 5
                      ? resizePhaseRows(f.phaseRows, n)
                      : f.phaseRows,
                }))
              }}
              hint="Total phases (1–5)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prop firm"
              options={firmOptions}
              value={form.propFirmId}
              onChange={(v) => setForm({ ...form, propFirmId: v })}
            />
            <Input
              label="Account size ($)"
              type="number"
              numeric
              value={form.accountSizeStr}
              onChange={(e) => setForm({ ...form, accountSizeStr: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="DD type"
              options={DD_TYPE_OPTIONS}
              value={form.dailyDrawdownType}
              onChange={(v) =>
                setForm({
                  ...form,
                  dailyDrawdownType: v as DrawdownType,
                })
              }
            />
            <Select
              label="DD basis"
              options={DD_BASIS_OPTIONS}
              value={form.drawdownBasis}
              onChange={(v) =>
                setForm({
                  ...form,
                  drawdownBasis: v as DrawdownBasis,
                })
              }
            />
          </div>
          <PhaseRulesFields
            rows={form.phaseRows}
            onChange={(rows) =>
              setForm((f) => ({ ...f, phaseRows: rows, stepCount: String(rows.length) }))
            }
            idPrefix="tmpl-phase"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Leverage"
              type="number"
              numeric
              value={form.leverage}
              onChange={(e) => setForm({ ...form, leverage: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-text-secondary">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} loading={saving}>
              Create template
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal — name, notes + numeric config (targets P1–P3, single DD set) */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={`Edit ${editTarget?.name ?? ''}`}
        maxWidth="540px"
      >
        <div className="space-y-4">
          <Input label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Steps"
              type="number"
              numeric
              value={editSteps}
              onChange={(e) => setEditSteps(e.target.value)}
              hint="1–5"
            />
            <Input
              label="Account size ($)"
              type="number"
              numeric
              value={editSize}
              onChange={(e) => setEditSize(e.target.value)}
            />
            <Input
              label="Leverage"
              type="number"
              numeric
              value={editLeverage}
              onChange={(e) => setEditLeverage(e.target.value)}
              hint="Min 1, max 3000"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Daily DD (%)"
              type="number"
              numeric
              value={editDailyDd}
              onChange={(e) => setEditDailyDd(e.target.value)}
            />
            <Input
              label="Total DD (%)"
              type="number"
              numeric
              value={editTotalDd}
              onChange={(e) => setEditTotalDd(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="DD type"
              options={DD_TYPE_OPTIONS}
              value={editDdType}
              onChange={(v) => setEditDdType(v as DrawdownType)}
            />
            <Select
              label="DD basis"
              options={DD_BASIS_OPTIONS}
              value={editDdBasis}
              onChange={(v) => setEditDdBasis(v as DrawdownBasis)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Target P1 (%)"
              type="number"
              numeric
              value={editTarget1}
              onChange={(e) => setEditTarget1(e.target.value)}
            />
            <Input
              label="Target P2 (%)"
              type="number"
              numeric
              value={editTarget2}
              onChange={(e) => setEditTarget2(e.target.value)}
              hint="Blank = none"
            />
            <Input
              label="Target P3 (%)"
              type="number"
              numeric
              value={editTarget3}
              onChange={(e) => setEditTarget3(e.target.value)}
              hint="Blank = none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-text-secondary">Notes</label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Optional notes…"
              className="w-full rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary placeholder:text-text-muted resize-none focus:border-accent-a focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleEditSave()} loading={saving}>
              Save changes
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
