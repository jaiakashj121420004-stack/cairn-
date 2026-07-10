import {
  BROKER_AUTO_LOG_MODE_SETTING_KEY,
  DEFAULT_BROKER_AUTO_LOG_MODE,
  type BrokerAccountMapEntry,
  type BrokerAutoLogMode,
  type BrokerDiagnostics,
  type BrokerKind,
  type BrokerStatus,
  type CtraderEnvironment,
  type CtraderRuntimeConfig,
  type Mt5BridgeConfig,
  type UnmappedBrokerAccount,
} from '@cairn/shared-types'
import { Check, Copy, Download, FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Account } from '@shared/types/index'
import { Button, Input, Select } from '../../../components/ui'
import { useToast } from '../../../components/ui'
import { ipc } from '../../../lib/ipc'

const AUTO_LOG_OPTIONS = [
  { value: 'draft_awaiting_context', label: 'Draft awaiting context (recommended)' },
  { value: 'fully_auto', label: 'Fully auto-logged' },
]

export function IntegrationsTab() {
  const [autoLogMode, setAutoLogMode] = useState<BrokerAutoLogMode>(DEFAULT_BROKER_AUTO_LOG_MODE)
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const res = await ipc.settings.get<BrokerAutoLogMode>(BROKER_AUTO_LOG_MODE_SETTING_KEY)
      if (res.ok && res.data === 'fully_auto') setAutoLogMode('fully_auto')
      else setAutoLogMode('draft_awaiting_context')
    })()
  }, [])

  async function save(value: BrokerAutoLogMode) {
    const res = await ipc.settings.set(BROKER_AUTO_LOG_MODE_SETTING_KEY, value)
    if (res.ok) toast('Saved', 'success')
    else toast('Save failed', 'error')
  }

  return (
    <div className="max-w-xl space-y-10">
      <ConnectionHealthCard />

      <section className="space-y-6">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary">Live broker auto-log</h2>
          <p className="mt-1 text-caption text-text-muted leading-relaxed">
            When a fill arrives from a connected broker (MT5 or cTrader), Cairn records the trade
            for you. This setting controls how much it records.
          </p>
        </div>

        <Select
          label="When a broker fill arrives"
          options={AUTO_LOG_OPTIONS}
          value={autoLogMode}
          onChange={(v) => {
            const next: BrokerAutoLogMode =
              v === 'fully_auto' ? 'fully_auto' : 'draft_awaiting_context'
            setAutoLogMode(next)
            void save(next)
          }}
        />

        <p className="text-caption text-text-muted leading-relaxed">
          {autoLogMode === 'draft_awaiting_context' ? (
            <>
              <span className="text-text-secondary">Draft awaiting context.</span> The mechanical
              facts — pair, direction, lots, entry, stop, target, exit, partials — are filled from
              the broker, and the trade joins the reflection queue on the Review screen. You still
              supply the honesty fields — invalidation, emotion, plan-followed, rules broken —
              calmly, later. Cairn never fills those in for you.
            </>
          ) : (
            <>
              <span className="text-text-secondary">Fully auto-logged.</span> The trade is written
              complete and never enters the reflection queue. The honesty fields stay{' '}
              <span className="text-text-secondary">unreviewed</span> — Cairn will not claim you
              followed your plan on a trade it never asked you about, and an unreviewed trade is
              never counted as a clean trade in your scores or grades.
            </>
          )}
        </p>

        <div className="rounded-[10px] border border-border bg-surface-elevated p-4">
          <p className="text-caption text-text-secondary leading-relaxed">
            Auto-log is <span className="font-medium">capture, not pre-trade prevention.</span> By
            the time a fill reaches Cairn, the order is already live at the broker — auto-log
            records what happened; it cannot block a trade before the click. The rule engine, hard
            locks, and loss limits run in the New Trade panel, not here.
          </p>
        </div>

        <div className="rounded-[10px] border border-border bg-surface-elevated p-4">
          <p className="text-caption text-text-secondary leading-relaxed">
            Cairn does watch your live position and{' '}
            <span className="font-medium">warns the moment it diverges from your rules</span> — a
            stop widened against you, a position sized up mid-trade, a target cut toward entry, an
            over-trade past your daily limit, a fill after your loss limit locked the session, or an
            entry outside your killzones. These are{' '}
            <span className="font-medium">detections, not blocks:</span> Cairn cannot stop an order
            that is already live at the broker, so it raises a calm warning and records the breach
            with the trade. The breach shows up in your analytics and at reflection time.
          </p>
        </div>
      </section>

      <Mt5BridgePanel />

      <CtraderPanel />

      <AccountMappingPanel />
    </div>
  )
}

/** Polling cadence + the window after which a heartbeat is considered stale. */
const STATUS_POLL_MS = 2_000
const STALE_AFTER_MS = 15_000

type LiveState = 'connected' | 'stale' | 'waiting'

function deriveLiveState(status: BrokerStatus | null, now: number): LiveState {
  if (!status) return 'waiting'
  const last = Math.max(status.lastHeartbeatMs ?? 0, status.lastEventMs ?? 0)
  if (last === 0) return 'waiting'
  return now - last <= STALE_AFTER_MS ? 'connected' : 'stale'
}

function secondsAgo(ms: number | null, now: number): string | null {
  if (ms === null) return null
  return `${Math.max(0, Math.round((now - ms) / 1000))}s ago`
}

/**
 * Settings → Integrations → Connection health (top of page). A single,
 * honest read of `broker:diagnostics`: both live-broker transports plus the
 * account map, sourced entirely from state the main process actually tracks —
 * a cTrader codec failure is surfaced verbatim rather than a bare "off".
 */
function ConnectionHealthCard() {
  const [diag, setDiag] = useState<BrokerDiagnostics | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const res = await ipc.broker.diagnostics()
    if (res.ok) setDiag(res.data)
    setNow(Date.now())
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), STATUS_POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  function dot(ok: boolean, hasError: boolean): string {
    if (ok) return 'bg-accent-a'
    return hasError ? 'bg-warning' : 'bg-text-muted'
  }

  const mt5LastEvent = diag ? secondsAgo(diag.mt5.lastEventAt, now) : null
  const ctraderLastEvent = diag ? secondsAgo(diag.ctrader.lastEventAt, now) : null

  return (
    <section className="space-y-4 rounded-[10px] border border-border bg-surface-elevated p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h3 font-semibold text-text-primary">Connection health</h2>
        <Button variant="secondary" size="sm" loading={refreshing} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-[8px] border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${dot(diag?.mt5.listening ?? false, false)}`}
            />
            <span className="text-body-sm font-medium text-text-primary">MetaTrader 5</span>
          </div>
          <p className="text-caption text-text-muted">
            {diag === null
              ? '…'
              : diag.mt5.listening
                ? `Listening on 127.0.0.1:${diag.mt5.port ?? '…'}`
                : 'Not listening'}
          </p>
          <p className="text-caption text-text-muted">
            Last event: {mt5LastEvent ?? (diag ? 'none yet' : '…')}
          </p>
        </div>

        <div className="space-y-1.5 rounded-[8px] border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${dot(diag?.ctrader.streaming ?? false, diag?.ctrader.codecError != null)}`}
            />
            <span className="text-body-sm font-medium text-text-primary">cTrader</span>
          </div>
          <p className="text-caption text-text-muted">
            {diag === null
              ? '…'
              : !diag.ctrader.linked
                ? 'Not linked'
                : diag.ctrader.streaming
                  ? 'Streaming'
                  : 'Linked, not streaming'}
            {diag && ` · codec ${diag.ctrader.codecLoaded ? 'loaded' : 'not loaded'}`}
          </p>
          <p className="text-caption text-text-muted">
            Last event: {ctraderLastEvent ?? (diag ? 'none yet' : '…')}
          </p>
          {diag?.ctrader.codecError && (
            <p className="mt-1 break-all rounded-[6px] bg-surface px-2 py-1 font-mono text-[11px] text-text-muted">
              {diag.ctrader.codecError}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-caption text-text-muted">
        <span>
          <span className="font-medium text-text-primary">
            {diag?.accountMap.mappedCount ?? '…'}
          </span>{' '}
          mapped
        </span>
        <span>
          <span className="font-medium text-text-primary">
            {diag?.accountMap.unmappedCount ?? '…'}
          </span>{' '}
          unmapped
        </span>
      </div>
    </section>
  )
}

/**
 * Settings → Integrations → MT5 (docs/broker-integration.md §2.1). Shows the
 * pairing token to paste into the EA, where to drop the `.mq5`, and a live
 * connection indicator driven by `broker:status` + the EA heartbeat.
 */
function Mt5BridgePanel() {
  const [config, setConfig] = useState<Mt5BridgeConfig | null>(null)
  const [status, setStatus] = useState<BrokerStatus | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const [copied, setCopied] = useState(false)
  const [installing, setInstalling] = useState(false)
  const toast = useToast()

  useEffect(() => {
    void (async () => {
      const res = await ipc.broker.getMt5Config()
      if (res.ok) setConfig(res.data)
    })()
  }, [])

  useEffect(() => {
    let active = true
    const poll = async () => {
      const res = await ipc.broker.status()
      if (active && res.ok) setStatus(res.data)
      if (active) setNow(Date.now())
    }
    void poll()
    const id = setInterval(() => void poll(), STATUS_POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  async function copyToken() {
    if (!config) return
    try {
      await navigator.clipboard.writeText(config.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('Could not copy to clipboard', 'error')
    }
  }

  async function installEa() {
    setInstalling(true)
    try {
      const res = await ipc.broker.installMt5Ea()
      if (!res.ok) {
        toast(res.error.message, 'error')
        return
      }
      const { installedPaths, failures, copiedFiles } = res.data
      if (installedPaths.length > 0) {
        const n = installedPaths.length
        toast(
          `Installed ${copiedFiles.join(' + ')} into ${n} Experts folder${n > 1 ? 's' : ''}`,
          'success',
        )
        // Refresh discovered paths, then reveal the first folder so the file is visible.
        const cfg = await ipc.broker.getMt5Config()
        if (cfg.ok) setConfig(cfg.data)
        const first = installedPaths[0]
        if (first) void ipc.broker.revealMt5Experts(first)
      }
      if (failures.length > 0) {
        const n = failures.length
        toast(`Could not write to ${n} folder${n > 1 ? 's' : ''} — is MetaTrader open?`, 'error')
      }
    } finally {
      setInstalling(false)
    }
  }

  async function openExperts(path: string) {
    const res = await ipc.broker.revealMt5Experts(path)
    if (!res.ok) toast(res.error.message, 'error')
  }

  const live = deriveLiveState(status, now)
  const lastEvent = status ? secondsAgo(status.lastEventMs, now) : null

  const indicator: Record<LiveState, { dot: string; label: string }> = {
    connected: { dot: 'bg-accent-a', label: 'EA connected' },
    stale: { dot: 'bg-warning', label: 'EA silent' },
    waiting: { dot: 'bg-text-muted', label: 'Disconnected — waiting for EA' },
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-h3 font-semibold text-text-primary">MetaTrader 5 bridge</h2>
        <p className="mt-1 text-caption text-text-muted leading-relaxed">
          The Cairn Bridge Expert Advisor runs inside your MT5 terminal and sends fills to Cairn
          over a local connection on your own machine. Nothing leaves your computer — the listener
          binds <span className="font-mono">127.0.0.1</span> only, and the bridge is read-only:
          Cairn never places, modifies, or closes an order.
        </p>
      </div>

      {/* Live connection indicator */}
      <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-elevated px-4 py-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${indicator[live].dot}`} />
        <span className="text-body text-text-primary">{indicator[live].label}</span>
        {live !== 'waiting' && lastEvent && (
          <span className="text-caption text-text-muted">· last event {lastEvent}</span>
        )}
      </div>

      {/* Pairing token */}
      <div className="space-y-1.5">
        <label className="text-caption font-medium text-text-secondary">Pairing token</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-[8px] border border-border bg-surface px-3 py-2 font-mono text-caption text-text-primary">
            {config?.token ?? '…'}
          </code>
          <Button variant="secondary" onClick={() => void copyToken()} disabled={!config}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1.5">{copied ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
        <p className="text-caption text-text-muted leading-relaxed">
          Paste this into the EA&apos;s <span className="font-mono">InpToken</span> input. Every
          frame the EA sends must carry it; Cairn rejects any connection that does not.
        </p>
      </div>

      {/* Listener port */}
      <div className="space-y-1.5">
        <label className="text-caption font-medium text-text-secondary">Listener address</label>
        <code className="block rounded-[8px] border border-border bg-surface px-3 py-2 font-mono text-caption text-text-primary">
          127.0.0.1:{config?.port ?? '…'}
        </code>
      </div>

      {/* Experts folder + one-click install */}
      <div className="space-y-2">
        <label className="text-caption font-medium text-text-secondary">
          Install the EA into MQL5 / Experts
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void installEa()} disabled={installing}>
            <Download className="h-4 w-4" />
            <span className="ml-1.5">{installing ? 'Installing…' : 'Install Cairn EA'}</span>
          </Button>
          {config && config.expertsPaths.length === 0 && (
            <span className="text-caption text-text-muted">
              No MetaTrader 5 terminal detected yet
            </span>
          )}
        </div>

        {config && config.expertsPaths.length > 0 ? (
          <ul className="space-y-1">
            {config.expertsPaths.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <code
                  className="flex-1 truncate rounded-[8px] border border-border bg-surface px-3 py-2 font-mono text-caption text-text-primary"
                  title={p}
                >
                  {p}
                </code>
                <Button variant="secondary" onClick={() => void openExperts(p)}>
                  <FolderOpen className="h-4 w-4" />
                  <span className="ml-1.5">Open</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-muted leading-relaxed">
            {config?.expertsHint ?? '…'}
          </p>
        )}

        <p className="text-caption text-text-muted leading-relaxed">
          <span className="font-medium text-text-secondary">Install Cairn EA</span> copies{' '}
          <span className="font-mono">CairnBridge.mq5</span> into your terminal automatically. Then
          compile it in MetaEditor (F7), attach it to any chart, and allow{' '}
          <span className="font-mono">127.0.0.1</span> in Tools → Options → Expert Advisors. See the
          bundled <span className="font-mono">INSTALL.md</span> for the full walkthrough.
        </p>
      </div>
    </section>
  )
}

const CTRADER_ENV_OPTIONS = [
  { value: 'demo', label: 'Demo' },
  { value: 'live', label: 'Live' },
]

const CTRADER_INDICATOR: Record<BrokerStatus['connection'], { dot: string; label: string }> = {
  connected: { dot: 'bg-accent-a', label: 'Connected' },
  disconnected: { dot: 'bg-text-muted', label: 'Disconnected' },
  error: { dot: 'bg-warning', label: 'Connection error' },
}

/**
 * Settings → Integrations → cTrader (docs/broker-integration.md §2.2). OAuth
 * connect/disconnect, environment, linked-account + status, and the plain-language
 * disclosure that — unlike the on-device MT5 bridge — execution events transit
 * Spotware (read-only inbound).
 */
function CtraderPanel() {
  const [config, setConfig] = useState<CtraderRuntimeConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const toast = useToast()

  async function refresh() {
    const res = await ipc.broker.getCtraderConfig()
    if (res.ok) setConfig(res.data)
  }

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), STATUS_POLL_MS)
    return () => clearInterval(id)
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const res = await ipc.broker.ctraderConnect()
      if (res.ok) toast('cTrader connected', 'success')
      else if (res.error.code === 'CTRADER_CODEC_UNAVAILABLE')
        toast('Account linked — live streaming is unavailable in this build', 'info')
      else toast('Could not connect cTrader', 'error')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const res = await ipc.broker.ctraderDisconnect()
      if (res.ok) toast('cTrader disconnected', 'success')
      else toast('Could not disconnect', 'error')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  async function changeEnv(env: CtraderEnvironment) {
    const res = await ipc.broker.ctraderSetEnvironment(env)
    if (res.ok) {
      toast('Saved', 'success')
      void refresh()
    } else {
      toast('Save failed', 'error')
    }
  }

  async function saveCreds() {
    setSavingCreds(true)
    try {
      const res = await ipc.broker.setCtraderCredentials({ clientId, clientSecret })
      if (res.ok) {
        toast('Credentials saved', 'success')
        setClientId('')
        setClientSecret('')
        void refresh()
      } else {
        toast(res.error.message, 'error')
      }
    } finally {
      setSavingCreds(false)
    }
  }

  async function clearCreds() {
    const res = await ipc.broker.clearCtraderCredentials()
    if (res.ok) {
      toast('Credentials cleared', 'success')
      void refresh()
    } else {
      toast(res.error.message, 'error')
    }
  }

  const status = config?.connection ?? 'disconnected'
  const indicator = CTRADER_INDICATOR[status]

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-h3 font-semibold text-text-primary">cTrader</h2>
        <p className="mt-1 text-caption text-text-muted leading-relaxed">
          Connect your cTrader account through the official Open API. Cairn reads your fills in real
          time and is <span className="font-medium">read-only</span> — it never places, modifies, or
          closes an order.
        </p>
      </div>

      {/* Spotware disclosure — the one place data transits a third party */}
      <div className="rounded-[10px] border border-border bg-surface-elevated p-4">
        <p className="text-caption text-text-secondary leading-relaxed">
          Unlike the MetaTrader 5 bridge, which stays entirely on your machine, cTrader is a cloud
          service: your execution events travel through{' '}
          <span className="font-medium">Spotware&apos;s servers</span> to reach Cairn (read-only,
          inbound). No Cairn data is ever sent to Spotware. Your access tokens are kept in your
          operating system&apos;s secure keychain, never in plain text.
        </p>
      </div>

      {config && !config.appConfigured && (
        <div className="space-y-2.5 rounded-[10px] border border-border bg-surface-elevated p-4">
          <p className="text-caption text-text-secondary leading-relaxed">
            To connect, paste your cTrader Open API application credentials. Create a free app in
            Spotware&apos;s Open API portal with redirect URI{' '}
            <span className="font-mono">http://127.0.0.1:53129/ctrader/callback</span> and the{' '}
            <span className="font-mono">accounts</span> scope. Your secret is stored in your
            operating system&apos;s keychain — never on disk, never in logs.
          </p>
          <Input
            label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="e.g. 1234_aBcDeFg…"
          />
          <Input
            label="Client secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="••••••••••••"
          />
          <Button
            onClick={() => void saveCreds()}
            disabled={savingCreds || !clientId.trim() || !clientSecret.trim()}
          >
            {savingCreds ? 'Saving…' : 'Save credentials'}
          </Button>
        </div>
      )}

      {config?.appConfigured && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-muted">OAuth credentials configured.</span>
          <Button variant="secondary" onClick={() => void clearCreds()} disabled={busy}>
            Clear credentials
          </Button>
        </div>
      )}

      {/* Connection indicator */}
      <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-elevated px-4 py-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${indicator.dot}`} />
        <span className="text-body text-text-primary">{indicator.label}</span>
        {config?.accountId != null && (
          <span className="text-caption text-text-muted">· account {config.accountId}</span>
        )}
      </div>

      {/* Environment */}
      <Select
        label="Environment"
        options={CTRADER_ENV_OPTIONS}
        value={config?.environment ?? 'demo'}
        onChange={(v) => void changeEnv(v === 'live' ? 'live' : 'demo')}
      />

      {/* Connect / disconnect */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void connect()}
          disabled={busy || !config?.appConfigured}
        >
          {config?.hasTokens ? 'Reconnect' : 'Connect cTrader'}
        </Button>
        {config?.hasTokens && (
          <Button variant="secondary" onClick={() => void disconnect()} disabled={busy}>
            Disconnect
          </Button>
        )}
      </div>
    </section>
  )
}

const BROKER_LABEL: Record<BrokerKind, string> = {
  mt5: 'MetaTrader 5',
  ctrader: 'cTrader',
}

/**
 * Settings → Integrations → Account mapping (docs/broker-integration.md §6). A live
 * fill names a broker-side account; Cairn cannot attribute it until the trader binds
 * that account to one of their Cairn accounts. This panel lists the broker accounts
 * seen on the live stream but not yet bound (each bindable via a dropdown), and the
 * existing bindings (each editable / removable). Cairn never guesses an account.
 */
function AccountMappingPanel() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedBrokerAccount[]>([])
  const [bindings, setBindings] = useState<BrokerAccountMapEntry[]>([])
  const toast = useToast()

  const refresh = useCallback(async () => {
    const [u, b] = await Promise.all([
      ipc.broker.listUnmappedAccounts(),
      ipc.broker.listAccountMap(),
    ])
    if (u.ok) setUnmapped(u.data)
    if (b.ok) setBindings(b.data)
  }, [])

  useEffect(() => {
    void (async () => {
      const a = await ipc.accounts.list()
      if (a.ok) setAccounts(a.data)
    })()
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), STATUS_POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  async function bind(broker: BrokerKind, brokerAccountId: string, cairnAccountId: string) {
    const res = await ipc.broker.setAccountMap({ broker, brokerAccountId, cairnAccountId })
    if (res.ok) toast('Account bound', 'success')
    else toast('Could not save binding', 'error')
    await refresh()
  }

  async function remove(broker: BrokerKind, brokerAccountId: string) {
    const res = await ipc.broker.deleteAccountMap({ broker, brokerAccountId })
    if (res.ok) toast('Binding removed', 'success')
    else toast('Could not remove binding', 'error')
    await refresh()
  }

  const accountName = (id: string) =>
    accounts.find((a) => a.id === id)?.displayName ?? 'Unknown account'

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-h3 font-semibold text-text-primary">Account mapping</h2>
        <p className="mt-1 text-caption text-text-muted leading-relaxed">
          A broker fill arrives tagged with a broker-side account. Cairn files it under one of your
          accounts only once you bind them here — it never guesses. Until an account is bound, its
          fills are held and create no trade.
        </p>
      </div>

      {/* Unmapped — seen on the stream, not yet bound */}
      <div className="space-y-2">
        <h3 className="text-caption font-medium text-text-secondary">Waiting to be mapped</h3>
        {unmapped.length === 0 ? (
          <p className="text-caption text-text-muted leading-relaxed">
            No unmapped accounts. New broker accounts appear here the first time a fill arrives from
            them.
          </p>
        ) : (
          <ul className="space-y-2">
            {unmapped.map((u) => (
              <UnmappedRow
                key={`${u.broker}:${u.brokerAccountId}`}
                entry={u}
                accounts={accounts}
                onBind={(cairnAccountId) => void bind(u.broker, u.brokerAccountId, cairnAccountId)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Existing bindings — editable / removable */}
      {bindings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-caption font-medium text-text-secondary">Mapped accounts</h3>
          <ul className="space-y-2">
            {bindings.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-surface-elevated px-4 py-3"
              >
                <span className="font-mono text-caption text-text-primary">
                  {BROKER_LABEL[b.broker]} · {b.brokerAccountId}
                </span>
                <span className="text-text-muted">→</span>
                <div className="min-w-[180px] flex-1">
                  <Select
                    options={accounts.map((a) => ({ value: a.id, label: a.displayName }))}
                    value={b.cairnAccountId}
                    onChange={(v) => void bind(b.broker, b.brokerAccountId, v)}
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void remove(b.broker, b.brokerAccountId)}
                >
                  Remove
                </Button>
                <span className="sr-only">currently {accountName(b.cairnAccountId)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** One unmapped broker account with an account dropdown + a Bind action. */
function UnmappedRow({
  entry,
  accounts,
  onBind,
}: {
  entry: UnmappedBrokerAccount
  accounts: Account[]
  onBind: (cairnAccountId: string) => void
}) {
  const [selected, setSelected] = useState<string>('')

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-surface-elevated px-4 py-3">
      <div className="flex flex-col">
        <span className="font-mono text-caption text-text-primary">
          {BROKER_LABEL[entry.broker]} · {entry.brokerAccountId}
        </span>
        <span className="text-caption text-text-muted">
          {entry.eventCount} held event{entry.eventCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="min-w-[180px] flex-1">
        <Select
          options={accounts.map((a) => ({ value: a.id, label: a.displayName }))}
          value={selected}
          placeholder="Choose a Cairn account…"
          onChange={(v) => setSelected(v)}
        />
      </div>
      <Button variant="primary" disabled={!selected} onClick={() => onBind(selected)}>
        Bind
      </Button>
    </li>
  )
}
