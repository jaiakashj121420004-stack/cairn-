import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  Badge,
  Card,
  Modal,
  useToast,
  Tabs,
  Tooltip,
  GlassCard,
} from '../../components/ui'
import { cn } from '../../lib/cn'
import { formatCents, formatRMultiple, formatPercent, formatPips } from '../../lib/formatters'
import { ipc } from '../../lib/ipc'
import { DisciplineRing } from '../dashboard/DisciplineRing'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-h3 font-semibold text-text-primary">
        {title}
      </h2>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

type PreflightStatus = 'pass' | 'warn' | 'block'
const PREFLIGHT_ROWS: { label: string; status: PreflightStatus; msg?: string }[] = [
  { label: 'Within killzone', status: 'pass' },
  { label: 'Risk within 1% of account', status: 'pass' },
  {
    label: 'Daily loss limit',
    status: 'warn',
    msg: 'Approaching limit — 0.8R of buffer remaining.',
  },
  {
    label: 'MSS confirmed',
    status: 'block',
    msg: 'Confirm the market-structure shift before entry.',
  },
]

export function ComponentsPage() {
  const [checked, setChecked] = useState(false)
  const [radio, setRadio] = useState('a')
  const [switched, setSwitched] = useState(false)
  const [selectVal, setSelectVal] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [tabId, setTabId] = useState('overview')
  const toast = useToast()

  const pairOptions = [
    { value: 'EURUSD', label: 'EURUSD' },
    { value: 'GBPUSD', label: 'GBPUSD' },
    { value: 'USDJPY', label: 'USDJPY' },
    { value: 'XAUUSD', label: 'XAUUSD — Gold' },
    { value: 'BTCUSD', label: 'BTCUSD' },
    { value: 'AUDUSD', label: 'AUDUSD' },
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-12">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-display font-semibold text-text-primary">Design System</h1>
            <p className="mt-1 text-body text-text-secondary">
              All primitives — Cairn §4 component baseline
            </p>
          </div>
          <ThemeToggle />
        </div>

        {/* Neon Cockpit HUD — v2.1 design language */}
        <Section title="Neon Cockpit HUD">
          <p className="-mt-1 text-body-sm text-text-muted">
            v2.1 (2026-07-09) — frosted HUD panels, luminous borders, corner brackets, and glow that
            carries meaning. JetBrains Mono keeps every number crisp.
          </p>

          {/* Aurora ribbon — page-top signature accent */}
          <div
            className="aurora-ribbon h-[2px] w-full rounded-full opacity-80"
            aria-hidden="true"
          />

          {/* GlassCard — crown highlight + outer glow, one per accent */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(['info', 'accent-a', 'accent-b', 'danger'] as const).map((h) => (
              <GlassCard key={h} highlight={h} glow padding="default">
                <p className="text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {h}
                </p>
                <p className="stat-number mt-1 text-h2 text-text-primary">+2.34R</p>
                <p className="mt-1 text-caption text-text-muted">crown + glow</p>
              </GlassCard>
            ))}
          </div>

          {/* Hero glass with HUD corner brackets + signal text */}
          <div className="grid gap-4 sm:grid-cols-2">
            <GlassCard hero padding="large" className="hud-corners overflow-hidden">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
                Hero panel · HUD corners
              </p>
              <p className="stat-number mt-2 text-display text-text-primary text-glow-info">128</p>
              <p className="mt-1 text-caption text-text-secondary">
                glass-hero + hud-corners + text-glow-info
              </p>
            </GlassCard>
            <div className="glass rounded-[16px] p-5">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-text-muted">
                Gradient numerals
              </p>
              <div className="mt-2 space-y-1">
                <p className="stat-number text-h1 text-gradient-summit">+18.4%</p>
                <p className="stat-number text-h2 text-gradient-danger">-2.10R</p>
                <p className="stat-number text-h2 text-gradient-amber">61%</p>
              </div>
            </div>
          </div>

          {/* Pre-flight rule check + Discipline Ring */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass rounded-[12px] p-3">
              <p className="mb-2 text-caption font-medium text-text-secondary">
                Rule check (pre-flight)
              </p>
              <div className="space-y-1">
                {PREFLIGHT_ROWS.map((r) => {
                  const Icon =
                    r.status === 'pass'
                      ? CheckCircle2
                      : r.status === 'block'
                        ? XCircle
                        : AlertTriangle
                  const rowClass =
                    r.status === 'pass'
                      ? 'border-l-accent-a/70 bg-accent-a/[0.06]'
                      : r.status === 'block'
                        ? 'border-l-danger/70 bg-danger/[0.07]'
                        : 'border-l-warning/70 bg-warning/[0.07]'
                  const iconClass =
                    r.status === 'pass'
                      ? 'text-accent-a'
                      : r.status === 'block'
                        ? 'text-danger'
                        : 'text-warning'
                  const textClass =
                    r.status === 'pass'
                      ? 'text-text-secondary'
                      : r.status === 'block'
                        ? 'text-danger'
                        : 'text-warning'
                  return (
                    <div
                      key={r.label}
                      className={cn(
                        'flex items-start gap-2 rounded-[6px] border-l-2 py-1 pl-2 pr-1',
                        rowClass,
                      )}
                    >
                      <Icon
                        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', iconClass)}
                        strokeWidth={1.5}
                      />
                      <div className="min-w-0">
                        <p className={cn('text-caption font-medium', textClass)}>{r.label}</p>
                        {r.msg && <p className="text-caption text-text-muted">{r.msg}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="glass flex items-center justify-center rounded-[16px] p-4">
              <DisciplineRing
                score={82}
                window={20}
                ruleBreakdown={[
                  { ruleKey: 'move_stop_loss', count: 2 },
                  { ruleKey: 'over_leverage', count: 1 },
                ]}
              />
            </div>
          </div>
        </Section>

        {/* Formatters */}
        <Section title="Formatters">
          <Card>
            <div className="grid grid-cols-2 gap-3 font-mono text-body sm:grid-cols-4">
              <div>
                <p className="text-caption text-text-muted">formatCents</p>
                <p className="text-text-primary">{formatCents(500000)}</p>
                <p className="text-text-primary">{formatCents(-87350)}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted">formatRMultiple</p>
                <p className="text-text-primary">{formatRMultiple(234)}</p>
                <p className="text-text-primary">{formatRMultiple(-100)}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted">formatPercent</p>
                <p className="text-text-primary">{formatPercent(87)}</p>
                <p className="text-text-primary">{formatPercent(-87)}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted">formatPips</p>
                <p className="text-text-primary">{formatPips(243)}</p>
                <p className="text-text-primary">{formatPips(80)}</p>
              </div>
            </div>
          </Card>
        </Section>

        {/* Buttons */}
        <Section title="Button">
          <Row>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </Row>
          <Row>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Row>
        </Section>

        {/* Badges */}
        <Section title="Badge">
          <Row>
            {(
              ['default', 'success', 'process', 'warning', 'danger', 'info', 'neutral'] as const
            ).map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
          </Row>
          <Row>
            {(
              ['default', 'success', 'process', 'warning', 'danger', 'info', 'neutral'] as const
            ).map((v) => (
              <Badge key={v} variant={v} shape="solid">
                {v}
              </Badge>
            ))}
          </Row>
        </Section>

        {/* Inputs */}
        <Section title="Input">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Trade pair" placeholder="EURUSD" />
            <Input label="Lot size" numeric unit="lots" placeholder="0.10" />
            <Input label="With hint" placeholder="Enter value" hint="This is a hint message" />
            <Input label="With error" placeholder="Enter value" error="This field is required" />
          </div>
        </Section>

        {/* Textarea */}
        <Section title="Textarea">
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea label="Trade rationale" placeholder="Describe your entry reason…" />
            <Textarea label="With error" placeholder="Required" error="Rationale is required" />
          </div>
        </Section>

        {/* Select */}
        <Section title="Select">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Pair"
              options={pairOptions}
              value={selectVal}
              onChange={setSelectVal}
              placeholder="Choose a pair…"
            />
            <Select
              label="Searchable"
              options={pairOptions}
              value={selectVal}
              onChange={setSelectVal}
              placeholder="Search pairs…"
              searchable
            />
          </div>
        </Section>

        {/* Checkbox, Radio, Switch */}
        <Section title="Checkbox / Radio / Switch">
          <Row>
            <Checkbox
              label="Accept rules"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <Checkbox label="Disabled" disabled />
            <Checkbox label="Checked disabled" checked disabled />
          </Row>
          <Row>
            <Radio
              label="Option A"
              name="demo"
              value="a"
              checked={radio === 'a'}
              onChange={() => setRadio('a')}
            />
            <Radio
              label="Option B"
              name="demo"
              value="b"
              checked={radio === 'b'}
              onChange={() => setRadio('b')}
            />
            <Radio label="Disabled" name="demo" value="c" disabled />
          </Row>
          <Row>
            <Switch label="Enabled" checked={switched} onChange={setSwitched} />
            <Switch label="Disabled" disabled />
          </Row>
        </Section>

        {/* Card */}
        <Section title="Card">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card padding="compact">
              <p className="text-caption text-text-muted">Compact</p>
              <p className="mt-1 text-body text-text-primary">16px padding</p>
            </Card>
            <Card padding="default">
              <p className="text-caption text-text-muted">Default</p>
              <p className="mt-1 text-body text-text-primary">20px padding</p>
            </Card>
            <Card padding="large" hoverable>
              <p className="text-caption text-text-muted">Large + hoverable</p>
              <p className="mt-1 text-body text-text-primary">24px padding</p>
            </Card>
          </div>
        </Section>

        {/* Tabs */}
        <Section title="Tabs">
          <div className="flex flex-col gap-4">
            <Tabs
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'trades', label: 'Trades' },
                { id: 'analytics', label: 'Analytics' },
                { id: 'rules', label: 'Rules' },
              ]}
              activeId={tabId}
              onChange={setTabId}
            />
            <p className="text-body-sm text-text-muted">Active: {tabId}</p>
          </div>
        </Section>

        {/* Tooltip */}
        <Section title="Tooltip">
          <Row>
            <Tooltip content="Top tooltip" side="top">
              <Button variant="secondary" size="sm">
                Hover me (top)
              </Button>
            </Tooltip>
            <Tooltip content="Bottom tooltip" side="bottom">
              <Button variant="secondary" size="sm">
                Hover me (bottom)
              </Button>
            </Tooltip>
            <Tooltip content="Right tooltip" side="right">
              <Button variant="secondary" size="sm">
                Hover me (right)
              </Button>
            </Tooltip>
          </Row>
        </Section>

        {/* Modal */}
        <Section title="Modal">
          <Row>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
          </Row>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example modal">
            <p className="text-body text-text-secondary">
              Scale+fade entrance, ESC to close, backdrop click to close.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setModalOpen(false)}>Confirm</Button>
            </div>
          </Modal>
        </Section>

        {/* Toast */}
        <Section title="Toast">
          <Row>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast('Trade closed. +2.3R. Rules: clean.', 'success')}
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast('Daily loss limit reached. Session closed.', 'error', 6000)}
            >
              Error toast
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast('Outside killzone — confirm entry.', 'warning')}
            >
              Warning toast
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast('Bias loaded: Bearish. Session open.', 'info')}
            >
              Info toast
            </Button>
          </Row>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <div className="flex flex-col gap-2">
            {(
              [
                ['display-xl', 'Display XL — 56px'],
                ['display-lg', 'Display LG — 40px'],
                ['display', 'Display — 32px'],
                ['h1', 'Heading 1 — 24px'],
                ['h2', 'Heading 2 — 20px'],
                ['h3', 'Heading 3 — 17px'],
                ['body-lg', 'Body LG — 16px'],
                ['body', 'Body — 14px'],
                ['body-sm', 'Body SM — 13px'],
                ['caption', 'Caption — 12px'],
                ['micro', 'Micro — 11px'],
              ] as const
            ).map(([size, label]) => (
              <p key={size} className={`text-${size} text-text-primary`}>
                {label}
              </p>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-mono text-body text-text-primary">
              JetBrains Mono — $5,000.00 / +2.34R / 24.3 pips
            </p>
            <p className="text-body text-text-secondary">text-secondary — secondary label</p>
            <p className="text-body text-text-muted">text-muted — muted / timestamps</p>
            <p className="text-body text-accent-a">text-accent-a — signal (wins)</p>
            <p className="text-body text-accent-b">text-accent-b — process (rules)</p>
            <p className="text-body text-danger">text-danger — losses / violations</p>
            <p className="text-body text-warning">text-warning — caution</p>
            <p className="text-body text-info">text-info — informational</p>
          </div>
        </Section>

        {/* Dev tools */}
        <Section title="Dev Tools">
          <Row>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await ipc.settings.set('onboarding_completed', false)
                await ipc.settings.set('onboarding_step', 0)
                window.location.reload()
              }}
            >
              Reset onboarding
            </Button>
          </Row>
        </Section>

        <div className="pb-12 text-caption text-text-muted">Designed &amp; built by Jai Akash</div>
      </div>
    </div>
  )
}
