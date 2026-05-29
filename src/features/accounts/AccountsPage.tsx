import { useEffect, useState, useMemo } from 'react'
import { Plus, Pencil, ChevronRight } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import { Button, Badge, Modal, Input, Select } from '../../components/ui'
import { useToast } from '../../components/ui'
import type {
  Account,
  AccountStats,
  PropFirm,
  AccountTemplate,
  CreateAccountInput,
  AccountStatus,
} from '@shared/types/index'

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
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'retired', label: 'Retired' },
]

type CreateForm = {
  displayName: string
  propFirmId: string
  templateId: string
  stepCount: string
  currentPhase: string
  accountSizeStr: string
  leverage: string
  dailyDrawdownType: CreateAccountInput['dailyDrawdownType']
  dailyDrawdownValuePct: string
  totalDrawdownType: CreateAccountInput['totalDrawdownType']
  totalDrawdownValuePct: string
  drawdownBasis: CreateAccountInput['drawdownBasis']
  profitTargetPctStr: string
  challengeCostStr: string
  notes: string
  weekendHoldingAllowed: boolean
  newsTradingAllowed: boolean
}

const BLANK_FORM: CreateForm = {
  displayName: '',
  propFirmId: '',
  templateId: '',
  stepCount: '2',
  currentPhase: '1',
  accountSizeStr: '10000',
  leverage: '100',
  dailyDrawdownType: 'percent_of_balance',
  dailyDrawdownValuePct: '4',
  totalDrawdownType: 'percent_of_balance',
  totalDrawdownValuePct: '8',
  drawdownBasis: 'initial_balance',
  profitTargetPctStr: '10',
  challengeCostStr: '0',
  notes: '',
  weekendHoldingAllowed: false,
  newsTradingAllowed: false,
}

const STATUS_BADGE: Record<AccountStatus, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  active: 'success',
  passed: 'info',
  failed: 'danger',
  paused: 'warning',
  retired: 'neutral',
}

function fmtMoney(cents: number) {
  const abs = Math.abs(cents / 100)
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtBps(bps: number) {
  return `${(bps / 100).toFixed(1)}%`
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<AccountStats[]>([])
  const [firms, setFirms] = useState<PropFirm[]>([])
  const [templates, setTemplates] = useState<AccountTemplate[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<AccountStatus>('active')
  const [editLeverage, setEditLeverage] = useState('100')
  const [editNotes, setEditNotes] = useState('')
  const [editMaxTrades, setEditMaxTrades] = useState('0')
  const [editMaxLossFixed, setEditMaxLossFixed] = useState('0')
  const [editMaxLossPct, setEditMaxLossPct] = useState('0')
  const [form, setForm] = useState<CreateForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const toast = useToast()

  async function load() {
    const [ar, sr, fr, tr] = await Promise.all([
      ipc.accounts.list(),
      ipc.accounts.stats(),
      ipc.propFirms.list(),
      ipc.accountTemplates.list(),
    ])
    if (ar.ok) setAccounts(ar.data)
    if (sr.ok) setStats(sr.data)
    if (fr.ok) setFirms(fr.data)
    if (tr.ok) setTemplates(tr.data)
  }

  useEffect(() => { void load() }, [])

  const statsMap = useMemo(() => {
    const m = new Map<string, AccountStats>()
    stats.forEach((s) => m.set(s.accountId, s))
    return m
  }, [stats])

  const firmMap = useMemo(() => {
    const m = new Map<string, string>()
    firms.forEach((f) => m.set(f.id, f.name))
    return m
  }, [firms])

  const firmOptions = useMemo(() => firms.map((f) => ({ value: f.id, label: f.name })), [firms])

  const templateOptions = useMemo(() => [
    { value: '', label: 'No template' },
    ...templates
      .filter((t) => t.isArchived === 0 && (!form.propFirmId || t.propFirmId === form.propFirmId))
      .map((t) => ({ value: t.id, label: t.name })),
  ], [templates, form.propFirmId])

  const visible = useMemo(() => {
    return accounts.filter((a) => showAll || a.status === 'active' || a.status === 'paused')
  }, [accounts, showAll])

  function openCreate() {
    setForm({ ...BLANK_FORM, propFirmId: firms[0]?.id ?? '' })
    setCreateOpen(true)
  }

  async function openEdit(account: Account) {
    setEditTarget(account)
    setEditName(account.displayName)
    setEditStatus(account.status)
    setEditLeverage(String(account.leverage))
    setEditNotes(account.notes ?? '')
    setEditMaxTrades('0')
    setEditMaxLossFixed('0')
    setEditMaxLossPct('0')
    const rulesRes = await ipc.accountRules.list(account.id)
    if (!rulesRes.ok) return
    for (const r of rulesRes.data) {
      if (!r.enabled) continue
      try {
        const cfg = JSON.parse(r.value) as Record<string, number>
        if (r.ruleKey === 'max_trades_per_day' && cfg.maxTrades)
          setEditMaxTrades(String(cfg.maxTrades))
        if (r.ruleKey === 'max_daily_loss_fixed' && cfg.maxLossCents)
          setEditMaxLossFixed(String(cfg.maxLossCents / 100))
        if (r.ruleKey === 'max_daily_loss_pct' && cfg.maxPct)
          setEditMaxLossPct(String(cfg.maxPct / 100))
      } catch { /* skip malformed */ }
    }
  }

  function applyTemplate(templateId: string) {
    const tmpl = templates.find((t) => t.id === templateId)
    if (!tmpl) return
    setForm((f) => ({
      ...f,
      templateId,
      stepCount: String(tmpl.stepCount),
      accountSizeStr: String(tmpl.accountSizeCents / 100),
      leverage: String(tmpl.leverage),
      dailyDrawdownType: tmpl.dailyDrawdownType,
      dailyDrawdownValuePct: String(tmpl.dailyDrawdownValue / 100),
      totalDrawdownType: tmpl.totalDrawdownType,
      totalDrawdownValuePct: String(tmpl.totalDrawdownValue / 100),
      drawdownBasis: tmpl.drawdownBasis,
      profitTargetPctStr: String(tmpl.profitTargetPhase1Pct / 100),
    }))
  }

  async function handleCreate() {
    if (!form.displayName) { toast('Display name is required', 'error'); return }
    if (!form.propFirmId) { toast('Select a prop firm', 'error'); return }
    setSaving(true)
    const res = await ipc.accounts.create({
      displayName: form.displayName,
      propFirmId: form.propFirmId,
      ...(form.templateId ? { templateId: form.templateId } : {}),
      stepCount: Number(form.stepCount),
      currentPhase: Number(form.currentPhase),
      accountSizeCents: Math.round(Number(form.accountSizeStr) * 100),
      leverage: Number(form.leverage),
      dailyDrawdownType: form.dailyDrawdownType,
      dailyDrawdownValue: Math.round(Number(form.dailyDrawdownValuePct) * 100),
      totalDrawdownType: form.totalDrawdownType,
      totalDrawdownValue: Math.round(Number(form.totalDrawdownValuePct) * 100),
      drawdownBasis: form.drawdownBasis,
      profitTargetPct: Math.round(Number(form.profitTargetPctStr) * 100),
      challengeCostCents: Math.round(Number(form.challengeCostStr) * 100),
      startDate: Date.now(),
      weekendHoldingAllowed: form.weekendHoldingAllowed,
      newsTradingAllowed: form.newsTradingAllowed,
      ...(form.notes ? { notes: form.notes } : {}),
    })
    if (res.ok) { toast('Account created', 'success'); await load(); setCreateOpen(false) }
    else toast(res.error.message, 'error')
    setSaving(false)
  }

  async function handleEditSave() {
    if (!editTarget) return
    setSaving(true)
    const leverageNum = parseInt(editLeverage, 10)
    const res = await ipc.accounts.update({
      id: editTarget.id,
      ...(editName ? { displayName: editName } : {}),
      status: editStatus,
      ...(leverageNum >= 1 && leverageNum <= 3000 ? { leverage: leverageNum } : {}),
      notes: editNotes || null,
    })
    if (res.ok) {
      const maxTradesNum = parseInt(editMaxTrades, 10) || 0
      const maxLossFixedNum = parseFloat(editMaxLossFixed) || 0
      const maxLossPctNum = parseFloat(editMaxLossPct) || 0
      await Promise.all([
        ipc.accountRules.upsert({
          accountId: editTarget.id,
          ruleKey: 'max_trades_per_day',
          enabled: maxTradesNum > 0,
          value: { maxTrades: maxTradesNum > 0 ? maxTradesNum : 2 },
        }),
        ipc.accountRules.upsert({
          accountId: editTarget.id,
          ruleKey: 'max_daily_loss_fixed',
          enabled: maxLossFixedNum > 0,
          value: { maxLossCents: maxLossFixedNum > 0 ? Math.round(maxLossFixedNum * 100) : 50000 },
        }),
        ipc.accountRules.upsert({
          accountId: editTarget.id,
          ruleKey: 'max_daily_loss_pct',
          enabled: maxLossPctNum > 0,
          value: { maxPct: maxLossPctNum > 0 ? Math.round(maxLossPctNum * 100) : 200 },
        }),
      ])
      toast('Account updated', 'success')
      await load()
      setEditTarget(null)
    } else {
      toast(res.error.message, 'error')
    }
    setSaving(false)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-5 flex items-center justify-between">
        <h1 className="text-h2 font-semibold text-text-primary">Accounts</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-caption text-text-muted underline-offset-2 hover:text-text-secondary hover:underline"
          >
            {showAll ? 'Active only' : 'Show all'}
          </button>
          <Button size="sm" onClick={openCreate} disabled={firms.length === 0}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Add account
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {firms.length === 0 && (
          <p className="text-caption text-text-muted mb-4">
            Add a prop firm in Settings → Prop Firms before creating accounts.
          </p>
        )}

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <p className="text-body text-text-muted">No accounts yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((account) => {
              const s = statsMap.get(account.id)
              const profitPct = s ? fmtBps(s.profitPctBps) : '—'
              const targetPct = fmtBps(account.profitTargetPct)
              const ddUsed = s ? fmtBps(s.ddUsedBps) : '—'
              const ddMax = fmtBps(account.totalDrawdownValue)
              const equity = fmtMoney(account.currentEquityCents)
              return (
                <div
                  key={account.id}
                  className="rounded-xl border border-border bg-surface p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-text-primary truncate">{account.displayName}</span>
                      <Badge variant={STATUS_BADGE[account.status]}>{account.status}</Badge>
                    </div>
                    <p className="text-caption text-text-muted">
                      {firmMap.get(account.propFirmId) ?? '—'} · Phase {account.currentPhase}/{account.stepCount} · {fmtMoney(account.accountSizeCents)}
                    </p>
                  </div>

                  <div className="hidden sm:grid grid-cols-4 gap-6 text-right shrink-0">
                    <Stat label="Equity" value={equity} />
                    <Stat label="P&L" value={profitPct} sub={`/ ${targetPct} target`} />
                    <Stat label="DD used" value={ddUsed} sub={`/ ${ddMax} max`} />
                    <Stat
                      label="Clean rate"
                      value={s ? `${(s.cleanRate * 100).toFixed(0)}%` : '—'}
                      sub={s ? `${s.tradeCount} trades` : ''}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void openEdit(account)}
                    className="ml-2 rounded-[8px] p-1.5 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <ChevronRight className="h-4 w-4 text-text-muted/40 shrink-0" strokeWidth={1.5} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add account" maxWidth="560px">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Display name"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="My Challenge"
            />
            <Select
              label="Prop firm"
              options={firmOptions}
              value={form.propFirmId}
              onChange={(v) => setForm({ ...form, propFirmId: v, templateId: '' })}
            />
          </div>
          <Select
            label="Template (optional)"
            options={templateOptions}
            value={form.templateId}
            onChange={(v) => { setForm((f) => ({ ...f, templateId: v })); applyTemplate(v) }}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Account size ($)"
              type="number"
              numeric
              value={form.accountSizeStr}
              onChange={(e) => setForm({ ...form, accountSizeStr: e.target.value })}
            />
            <Input
              label="Steps"
              type="number"
              numeric
              value={form.stepCount}
              onChange={(e) => setForm({ ...form, stepCount: e.target.value })}
              hint="Total phases"
            />
            <Input
              label="Current phase"
              type="number"
              numeric
              value={form.currentPhase}
              onChange={(e) => setForm({ ...form, currentPhase: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Daily DD (%)"
              type="number"
              numeric
              value={form.dailyDrawdownValuePct}
              onChange={(e) => setForm({ ...form, dailyDrawdownValuePct: e.target.value })}
            />
            <Input
              label="Total DD (%)"
              type="number"
              numeric
              value={form.totalDrawdownValuePct}
              onChange={(e) => setForm({ ...form, totalDrawdownValuePct: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="DD type"
              options={DD_TYPE_OPTIONS}
              value={form.dailyDrawdownType}
              onChange={(v) => setForm({ ...form, dailyDrawdownType: v as CreateAccountInput['dailyDrawdownType'] })}
            />
            <Select
              label="DD basis"
              options={DD_BASIS_OPTIONS}
              value={form.drawdownBasis}
              onChange={(v) => setForm({ ...form, drawdownBasis: v as CreateAccountInput['drawdownBasis'] })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Profit target (%)"
              type="number"
              numeric
              value={form.profitTargetPctStr}
              onChange={(e) => setForm({ ...form, profitTargetPctStr: e.target.value })}
            />
            <Input
              label="Leverage"
              type="number"
              numeric
              value={form.leverage}
              onChange={(e) => setForm({ ...form, leverage: e.target.value })}
            />
            <Input
              label="Challenge cost ($)"
              type="number"
              numeric
              value={form.challengeCostStr}
              onChange={(e) => setForm({ ...form, challengeCostStr: e.target.value })}
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
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} loading={saving}>Create account</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={`Edit ${editTarget?.displayName ?? ''}`}
        maxWidth="460px"
      >
        <div className="space-y-4">
          <Input
            label="Display name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={editStatus}
              onChange={(v) => setEditStatus(v as AccountStatus)}
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
          <div className="rounded-[10px] border border-border bg-surface-elevated/50 p-3 space-y-3">
            <p className="text-caption font-medium text-text-secondary">Daily limits (0 = disabled)</p>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Max trades/day"
                type="number"
                numeric
                value={editMaxTrades}
                onChange={(e) => setEditMaxTrades(e.target.value)}
                hint="0 = off"
              />
              <Input
                label="Max loss ($)"
                type="number"
                numeric
                value={editMaxLossFixed}
                onChange={(e) => setEditMaxLossFixed(e.target.value)}
                hint="0 = off"
              />
              <Input
                label="Max loss (%)"
                type="number"
                numeric
                value={editMaxLossPct}
                onChange={(e) => setEditMaxLossPct(e.target.value)}
                hint="0 = off"
              />
            </div>
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
            <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => void handleEditSave()} loading={saving}>Save changes</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-caption text-text-muted mb-0.5">{label}</p>
      <p className="text-body font-semibold text-text-primary font-mono">{value}</p>
      {sub && <p className="text-caption text-text-muted">{sub}</p>}
    </div>
  )
}
