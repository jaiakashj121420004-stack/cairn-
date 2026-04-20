import { useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type {
  Account,
  DraftTradeInput,
  RuleEvaluationDTO,
  SessionStateDTO,
} from '@shared/types/index'
import { Button, Input, Select, Card, Badge } from '../../components/ui'

type RuleMeta = {
  key: string
  label: string
  description: string
  category: string
  severity: string
  isHardLock: boolean
}

const SEVERITY_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
}

function makeBlankDraft(accountId: string, pairId: string, setupId: string): DraftTradeInput {
  return {
    accountId,
    sessionId: null,
    pairId,
    setupId,
    killzoneId: null,
    direction: 'long',
    entryPrice: 108000,
    stopLossPrice: 107900,
    takeProfitPrice: 108200,
    slPips: 100,
    rrRatio: 200,
    lotSize: 50,
    riskAmountCents: 10000,
    riskPctBps: 100,
    plannedInvalidation: 'Price closes back inside the FVG.',
    mssConfirmed: 1,
    htfBiasAligned: 1,
    dxyAligned: 1,
    preCalmScore: 8,
    preUrgencyScore: 3,
    preNeedScore: 2,
  }
}

export function RulesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [rules, setRules] = useState<RuleMeta[]>([])
  const [draft, setDraft] = useState<DraftTradeInput | null>(null)
  const [evals, setEvals] = useState<RuleEvaluationDTO[]>([])
  const [session, setSession] = useState<SessionStateDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [accRes, rulesRes] = await Promise.all([
        ipc.accounts.list(),
        ipc.rules.listAvailable(),
      ])
      if (accRes.ok) {
        setAccounts(accRes.data)
        if (accRes.data[0]) setAccountId(accRes.data[0].id)
      }
      if (rulesRes.ok) setRules(rulesRes.data)
    })()
  }, [])

  useEffect(() => {
    if (!accountId) return
    setDraft(makeBlankDraft(accountId, 'pair-eurusd', 'setup-fvg'))
    void refreshSession(accountId)
  }, [accountId])

  async function refreshSession(id: string) {
    const res = await ipc.rules.getSessionState(id)
    if (res.ok) setSession(res.data)
  }

  async function evaluate() {
    if (!draft) return
    setBusy(true)
    setError(null)
    const res = await ipc.rules.evaluatePreTrade(draft)
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      setEvals([])
      return
    }
    setEvals(res.data)
    await refreshSession(draft.accountId)
  }

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: a.displayName })),
    [accounts],
  )

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-display font-semibold text-text-primary">Rules Engine — Dev</h1>
          <p className="text-body text-text-secondary">
            Build a draft trade, evaluate against the active account&apos;s rules, and inspect
            session state. Dev-only — not linked from the sidebar.
          </p>
        </header>

        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-mono">
              <span className="text-text-secondary">Account</span>
              <Select
                value={accountId}
                onChange={(v) => setAccountId(v)}
                options={accountOptions}
                placeholder="Select account"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-mono text-text-secondary">Session state</span>
              <div className="flex items-center gap-2">
                <Badge variant={session?.state === 'locked' ? 'danger' : 'info'}>
                  {session?.state ?? '—'}
                </Badge>
                {session?.lockedReason && (
                  <span className="text-mono text-text-secondary">{session.lockedReason}</span>
                )}
              </div>
            </div>
          </div>

          {draft && (
            <div className="grid grid-cols-3 gap-3">
              <NumField label="rrRatio (×100)" value={draft.rrRatio} onChange={(v) => setDraft({ ...draft, rrRatio: v })} />
              <NumField label="riskPctBps" value={draft.riskPctBps} onChange={(v) => setDraft({ ...draft, riskPctBps: v })} />
              <NumField label="riskAmountCents" value={draft.riskAmountCents} onChange={(v) => setDraft({ ...draft, riskAmountCents: v })} />
              <NumField label="lotSize" value={draft.lotSize} onChange={(v) => setDraft({ ...draft, lotSize: v })} />
              <NumField label="slPips" value={draft.slPips} onChange={(v) => setDraft({ ...draft, slPips: v })} />
              <NumField label="mssConfirmed (0/1)" value={draft.mssConfirmed} onChange={(v) => setDraft({ ...draft, mssConfirmed: v })} />
              <NumField label="htfBiasAligned (0/1)" value={draft.htfBiasAligned} onChange={(v) => setDraft({ ...draft, htfBiasAligned: v })} />
              <NumField label="preCalmScore" value={draft.preCalmScore} onChange={(v) => setDraft({ ...draft, preCalmScore: v })} />
              <NumField label="preUrgencyScore" value={draft.preUrgencyScore} onChange={(v) => setDraft({ ...draft, preUrgencyScore: v })} />
              <label className="col-span-3 flex flex-col gap-1 text-mono">
                <span className="text-text-secondary">plannedInvalidation</span>
                <Input
                  value={draft.plannedInvalidation}
                  onChange={(e) => setDraft({ ...draft, plannedInvalidation: e.target.value })}
                />
              </label>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => void evaluate()} disabled={!draft || busy}>
              Evaluate
            </Button>
            <Button
              variant="secondary"
              onClick={() => accountId && void refreshSession(accountId)}
            >
              Refresh session state
            </Button>
          </div>

          {error && <div className="text-mono text-danger">{error}</div>}
        </Card>

        <Card className="space-y-2 p-4">
          <h2 className="text-h3 font-semibold text-text-primary">Evaluations</h2>
          {evals.length === 0 && <p className="text-text-secondary">No evaluations yet.</p>}
          <ul className="divide-y divide-border">
            {evals.map((e) => (
              <li key={e.ruleKey} className="flex items-start gap-3 py-2">
                <Badge variant={e.passed ? 'success' : SEVERITY_VARIANT[e.severity] ?? 'info'}>
                  {e.passed ? 'pass' : e.severity}
                </Badge>
                <div className="flex-1">
                  <div className="font-semibold text-text-primary">{e.ruleLabel}</div>
                  <div className="text-mono text-text-secondary">{e.message}</div>
                  {e.suggestedAction && (
                    <div className="text-mono text-text-secondary">→ {e.suggestedAction}</div>
                  )}
                </div>
                {!e.canOverride && <Badge variant="danger">hard</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="text-h3 font-semibold text-text-primary">Available rules ({rules.length})</h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 text-mono">
            {rules.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span className="text-text-primary">{r.key}</span>
                {r.isHardLock && <Badge variant="danger">hard</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-mono">
      <span className="text-text-secondary">{label}</span>
      <Input
        type="number"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
