import { useState } from 'react'
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
} from '../../components/ui'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import { formatCents, formatRMultiple, formatPercent, formatPips } from '../../lib/formatters'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-h3 font-semibold text-text-primary">{title}</h2>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

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
            {(['default', 'success', 'process', 'warning', 'danger', 'info', 'neutral'] as const).map(
              (v) => (
                <Badge key={v} variant={v}>{v}</Badge>
              ),
            )}
          </Row>
          <Row>
            {(['default', 'success', 'process', 'warning', 'danger', 'info', 'neutral'] as const).map(
              (v) => (
                <Badge key={v} variant={v} shape="solid">{v}</Badge>
              ),
            )}
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
            <Checkbox label="Accept rules" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <Checkbox label="Disabled" disabled />
            <Checkbox label="Checked disabled" checked disabled />
          </Row>
          <Row>
            <Radio label="Option A" name="demo" value="a" checked={radio === 'a'} onChange={() => setRadio('a')} />
            <Radio label="Option B" name="demo" value="b" checked={radio === 'b'} onChange={() => setRadio('b')} />
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
              <Button variant="secondary" size="sm">Hover me (top)</Button>
            </Tooltip>
            <Tooltip content="Bottom tooltip" side="bottom">
              <Button variant="secondary" size="sm">Hover me (bottom)</Button>
            </Tooltip>
            <Tooltip content="Right tooltip" side="right">
              <Button variant="secondary" size="sm">Hover me (right)</Button>
            </Tooltip>
          </Row>
        </Section>

        {/* Modal */}
        <Section title="Modal">
          <Row>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
          </Row>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Example modal">
            <p className="text-body text-text-secondary">
              Scale+fade entrance, ESC to close, backdrop click to close.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={() => setModalOpen(false)}>Confirm</Button>
            </div>
          </Modal>
        </Section>

        {/* Toast */}
        <Section title="Toast">
          <Row>
            <Button variant="secondary" size="sm" onClick={() => toast('Trade closed. +2.3R. Rules: clean.', 'success')}>
              Success toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast('Daily loss limit reached. Session closed.', 'error', 6000)}>
              Error toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast('Outside killzone — confirm entry.', 'warning')}>
              Warning toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast('Bias loaded: Bearish. Session open.', 'info')}>
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
            <p className="font-mono text-body text-text-primary">JetBrains Mono — $5,000.00 / +2.34R / 24.3 pips</p>
            <p className="text-body text-text-secondary">text-secondary — secondary label</p>
            <p className="text-body text-text-muted">text-muted — muted / timestamps</p>
            <p className="text-body text-accent-a">text-accent-a — signal (wins)</p>
            <p className="text-body text-accent-b">text-accent-b — process (rules)</p>
            <p className="text-body text-danger">text-danger — losses / violations</p>
            <p className="text-body text-warning">text-warning — caution</p>
            <p className="text-body text-info">text-info — informational</p>
          </div>
        </Section>

        <div className="pb-12 text-caption text-text-muted">
          Designed &amp; built by Jai Akash
        </div>
      </div>
    </div>
  )
}
