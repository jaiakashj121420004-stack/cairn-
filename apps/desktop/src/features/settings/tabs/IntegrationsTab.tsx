import {
  BROKER_AUTO_LOG_MODE_SETTING_KEY,
  DEFAULT_BROKER_AUTO_LOG_MODE,
  type BrokerAutoLogMode,
  type BrokerStatus,
  type CtraderEnvironment,
  type CtraderRuntimeConfig,
  type Mt5BridgeConfig,
} from '@cairn/shared-types'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Select } from '../../../components/ui'
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
 * Settings → Integrations → MT5 (docs/broker-integration.md §2.1). Shows the
 * pairing token to paste into the EA, where to drop the `.mq5`, and a live
 * connection indicator driven by `broker:status` + the EA heartbeat.
 */
function Mt5BridgePanel() {
  const [config, setConfig] = useState<Mt5BridgeConfig | null>(null)
  const [status, setStatus] = useState<BrokerStatus | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())
  const [copied, setCopied] = useState(false)
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

      {/* Experts folder */}
      <div className="space-y-1.5">
        <label className="text-caption font-medium text-text-secondary">
          Install the EA into MQL5 / Experts
        </label>
        {config && config.expertsPaths.length > 0 ? (
          <ul className="space-y-1">
            {config.expertsPaths.map((p) => (
              <li
                key={p}
                className="truncate rounded-[8px] border border-border bg-surface px-3 py-2 font-mono text-caption text-text-primary"
                title={p}
              >
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-muted leading-relaxed">
            {config?.expertsHint ?? '…'}
          </p>
        )}
        <p className="text-caption text-text-muted leading-relaxed">
          Copy <span className="font-mono">CairnBridge.mq5</span> there, compile it in MetaEditor,
          attach it to any chart, and allow <span className="font-mono">127.0.0.1</span> in Tools →
          Options → Expert Advisors. See the bundled <span className="font-mono">INSTALL.md</span>{' '}
          for the full walkthrough.
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
        <p className="text-caption text-warning leading-relaxed">
          cTrader OAuth credentials are not configured in this build. Set{' '}
          <span className="font-mono">CTRADER_CLIENT_ID</span> and{' '}
          <span className="font-mono">CTRADER_CLIENT_SECRET</span> to enable the connection.
        </p>
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
