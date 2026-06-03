import { Upload, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  ImportPreview,
  ImportCommitResult,
  Pair,
  Setup,
  ImportParseError,
} from '@shared/types/index'
import { Button, Select, useToast } from '../../../components/ui'
import { cn } from '../../../lib/cn'
import { formatDate } from '../../../lib/formatters'
import { ipc } from '../../../lib/ipc'
import { useSessionStore } from '../../../stores/session-store'

// ─── Types ────────────────────────────────────────────────────────────────────

type Broker = 'mt5' | 'ctrader' | 'tradingview'
type Step = 'idle' | 'previewing' | 'preview' | 'committing' | 'done'

// ─── Constants ────────────────────────────────────────────────────────────────

const BROKER_OPTIONS: Array<{ value: Broker; label: string; hint: string }> = [
  { value: 'mt5', label: 'MetaTrader 5', hint: 'HTML statement export' },
  { value: 'ctrader', label: 'cTrader', hint: 'HTML statement export' },
  { value: 'tradingview', label: 'TradingView', hint: 'CSV list of trades' },
]

const ERROR_COPY: Record<string, string> = {
  VALIDATION_ERROR:
    'The file could not be validated. Make sure you selected the correct export format.',
  NOT_FOUND: 'The selected setup or account was not found.',
  UNRESOLVED_SYMBOLS: 'All symbols must be mapped before committing.',
  PARSE_ERROR: 'The file could not be parsed. Check that the format is correct.',
}

function errorCopy(code: string): string {
  return ERROR_COPY[code] ?? 'An unexpected error occurred.'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportTab() {
  const toast = useToast()
  const { selectedAccountId } = useSessionStore()

  const [broker, setBroker] = useState<Broker>('mt5')
  const [setupId, setSetupId] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ImportCommitResult | null>(null)
  const [pairs, setPairs] = useState<Pair[]>([])
  const [setups, setSetups] = useState<Setup[]>([])

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void Promise.all([
      ipc.pairs.list().then((r) => {
        if (r.ok) setPairs(r.data)
      }),
      ipc.setups.list().then((r) => {
        if (r.ok) setSetups(r.data)
      }),
    ])
  }, [])

  const pairOptions = pairs.map((p) => ({ value: p.id, label: p.symbol }))
  const setupOptions = setups.map((s) => ({ value: s.id, label: s.name }))

  const accept = broker === 'tradingview' ? '.csv' : '.html'

  const reset = useCallback(() => {
    setStep('idle')
    setFileContent(null)
    setPreview(null)
    setSymbolMap({})
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  // When broker changes, reset everything so stale file content doesn't carry over.
  function handleBrokerChange(b: Broker) {
    setBroker(b)
    reset()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!selectedAccountId) {
      toast('No account selected. Select an account from the sidebar first.', 'error')
      return
    }
    if (!setupId) {
      toast('Pick a default setup before previewing.', 'error')
      return
    }

    const content = await file.text()
    setFileContent(content)
    setStep('previewing')
    setPreview(null)
    setSymbolMap({})

    let res
    if (broker === 'mt5') {
      res = await ipc.import.previewMt5({ html: content, accountId: selectedAccountId })
    } else if (broker === 'ctrader') {
      res = await ipc.import.previewCtrader({ html: content, accountId: selectedAccountId })
    } else {
      res = await ipc.import.previewTradingView({ csv: content, accountId: selectedAccountId })
    }

    if (!res.ok) {
      toast(errorCopy(res.error.code), 'error')
      setStep('idle')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setPreview(res.data)
    setStep('preview')
  }

  async function handleCommit() {
    if (!preview || !fileContent || !selectedAccountId || !setupId) return

    setStep('committing')

    let res
    if (broker === 'mt5') {
      res = await ipc.import.commitMt5({
        html: fileContent,
        accountId: selectedAccountId,
        symbolMap,
        defaultSetupId: setupId,
      })
    } else if (broker === 'ctrader') {
      res = await ipc.import.commitCtrader({
        html: fileContent,
        accountId: selectedAccountId,
        symbolMap,
        defaultSetupId: setupId,
      })
    } else {
      res = await ipc.import.commitTradingView({
        csv: fileContent,
        accountId: selectedAccountId,
        symbolMap,
        defaultSetupId: setupId,
      })
    }

    if (!res.ok) {
      toast(errorCopy(res.error.code), 'error')
      setStep('preview')
      return
    }

    setResult(res.data)
    setStep('done')
    toast(`${res.data.imported} trade${res.data.imported === 1 ? '' : 's'} imported.`, 'success')
  }

  const canCommit =
    step === 'preview' &&
    !!preview &&
    preview.candidates.length > 0 &&
    preview.unresolvedSymbols.every((s) => !!symbolMap[s])

  return (
    <div className="max-w-2xl space-y-8">
      {/* ── Broker + config ────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-body font-semibold text-text-primary">Import statement</h3>
          <p className="mt-0.5 text-caption text-text-muted">
            Import closed trades from a broker statement. Duplicate trades are automatically
            skipped.
          </p>
        </div>

        {!selectedAccountId && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.5} />
            <span className="text-caption text-amber-300">
              No account selected. Select an account from the sidebar first.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <span className="text-caption font-medium text-text-secondary">Broker</span>
          <div className="flex flex-wrap gap-2">
            {BROKER_OPTIONS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => handleBrokerChange(b.value)}
                className={cn(
                  'flex flex-col rounded-xl border px-4 py-2.5 text-left transition-colors',
                  broker === b.value
                    ? 'border-accent-a/60 bg-accent-a/10 text-text-primary'
                    : 'border-border bg-surface-elevated text-text-secondary hover:border-border-strong hover:text-text-primary',
                )}
              >
                <span className="text-body font-medium">{b.label}</span>
                <span className="text-caption text-text-muted">{b.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Default setup"
          hint="Assigned to every imported trade. You can edit individual trades afterwards."
          options={setupOptions}
          value={setupId}
          onChange={setSetupId}
          placeholder="Pick a setup…"
          disabled={!selectedAccountId}
          className="max-w-xs"
        />
      </section>

      {/* ── File picker ───────────────────────────────────────────── */}
      {step === 'idle' && (
        <section className="space-y-3">
          <h3 className="text-body font-semibold text-text-primary">Choose file</h3>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
          <Button
            variant="secondary"
            disabled={!selectedAccountId || !setupId}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Choose {broker === 'tradingview' ? 'CSV' : 'HTML'} file
          </Button>
          {!selectedAccountId && (
            <p className="text-caption text-text-muted">Select an account first.</p>
          )}
          {selectedAccountId && !setupId && (
            <p className="text-caption text-text-muted">Pick a default setup first.</p>
          )}
        </section>
      )}

      {/* ── Loading preview ───────────────────────────────────────── */}
      {step === 'previewing' && (
        <section className="py-4">
          <p className="text-body text-text-muted">Reading file…</p>
        </section>
      )}

      {/* ── Preview ──────────────────────────────────────────────── */}
      {step === 'preview' && preview && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-body font-semibold text-text-primary">Preview</h3>
            <button
              type="button"
              onClick={reset}
              className="text-caption text-text-muted transition-colors hover:text-text-primary"
            >
              Choose different file
            </button>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2">
            <SummaryChip value={preview.candidates.length} label="new trades" />
            {preview.skippedCount > 0 && (
              <SummaryChip value={preview.skippedCount} label="already imported" muted />
            )}
            {preview.parseErrors.length > 0 && (
              <SummaryChip value={preview.parseErrors.length} label="parse errors" danger />
            )}
          </div>

          {/* All-skipped message */}
          {preview.candidates.length === 0 && preview.skippedCount > 0 && (
            <p className="text-caption text-text-muted">
              All trades in this file have already been imported.
            </p>
          )}

          {/* Candidate table */}
          {preview.candidates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/60">
                    <Th>Symbol</Th>
                    <Th>Dir</Th>
                    <Th>Entry</Th>
                    <Th>Exit</Th>
                    <Th right>P&L</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.candidates.map((c) => (
                    <tr key={c.externalRef} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-2 font-mono font-medium text-text-primary">
                        {c.symbol}
                      </td>
                      <td className="px-3 py-2 capitalize text-text-secondary">{c.direction}</td>
                      <td className="px-3 py-2 text-text-secondary">{formatDate(c.entryTime)}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {c.exitTime ? formatDate(c.exitTime) : '—'}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right font-mono',
                          parseFloat(c.pnlAmount) >= 0 ? 'text-accent-a' : 'text-danger',
                        )}
                      >
                        {parseFloat(c.pnlAmount) >= 0 ? '+' : ''}
                        {c.pnlAmount}
                      </td>
                      <td className="px-3 py-2 capitalize text-text-secondary">{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unresolved symbol mapper */}
          {preview.unresolvedSymbols.length > 0 && (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.5} />
                <p className="text-caption font-medium text-amber-300">
                  {preview.unresolvedSymbols.length} symbol
                  {preview.unresolvedSymbols.length > 1 ? 's' : ''} not found in your pairs list.
                  Map each one to continue.
                </p>
              </div>
              <div className="space-y-2">
                {preview.unresolvedSymbols.map((sym) => (
                  <div key={sym} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 font-mono text-body-sm font-medium text-text-primary">
                      {sym}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 text-text-muted"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0 flex-1">
                      <Select
                        options={pairOptions}
                        value={symbolMap[sym] ?? ''}
                        onChange={(id) => setSymbolMap((m) => ({ ...m, [sym]: id }))}
                        placeholder="Map to pair…"
                        searchable
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parse errors (collapsible) */}
          {preview.parseErrors.length > 0 && <ParseErrorList errors={preview.parseErrors} />}

          {/* Commit / cancel */}
          <div className="flex items-center gap-4">
            <Button variant="primary" disabled={!canCommit} onClick={() => void handleCommit()}>
              Import {preview.candidates.length} trade{preview.candidates.length === 1 ? '' : 's'}
            </Button>
            <button
              type="button"
              onClick={reset}
              className="text-body text-text-muted transition-colors hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* ── Committing ────────────────────────────────────────────── */}
      {step === 'committing' && (
        <section className="py-4">
          <p className="text-body text-text-muted">Importing trades…</p>
        </section>
      )}

      {/* ── Done ─────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <section className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-elevated p-4">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-accent-a" strokeWidth={1.5} />
            <div className="space-y-0.5">
              <p className="text-body font-semibold text-text-primary">Import complete</p>
              <p className="text-caption text-text-muted">
                {result.imported} trade{result.imported === 1 ? '' : 's'} imported
                {result.partials > 0 &&
                  `, ${result.partials} partial close${result.partials === 1 ? '' : 's'}`}
                {result.skipped > 0 &&
                  `, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped`}
                .
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={reset}>
            Import another file
          </Button>
        </section>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryChip({
  value,
  label,
  muted,
  danger,
}: {
  value: number
  label: string
  muted?: boolean
  danger?: boolean
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium',
        danger
          ? 'border-danger/30 bg-danger/10 text-danger'
          : muted
            ? 'border-border bg-surface-elevated text-text-muted'
            : 'border-accent-a/30 bg-accent-a/10 text-accent-a',
      )}
    >
      <span className="text-body-sm font-semibold tabular-nums">{value}</span>
      <span>{label}</span>
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn('px-3 py-2 font-medium text-text-muted', right ? 'text-right' : 'text-left')}>
      {children}
    </th>
  )
}

function ParseErrorList({ errors }: { errors: ImportParseError[] }) {
  return (
    <details className="rounded-xl border border-border">
      <summary className="cursor-pointer px-4 py-3 text-caption font-medium text-text-muted">
        {errors.length} row{errors.length > 1 ? 's' : ''} could not be parsed (will be skipped)
      </summary>
      <ul className="border-t border-border px-4 pb-3 pt-2 space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="text-caption text-text-muted">
            Row {e.rowIndex}: {e.reason}
          </li>
        ))}
      </ul>
    </details>
  )
}
