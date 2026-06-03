export interface NotebookTemplate {
  id: string
  label: string
  title: string
  content: string
}

/** Built-in starting points. Content is markdown rendered by the subset renderer
 *  (headings, lists, blockquotes, bold) — no tables, so previews stay clean. */
export const NOTEBOOK_TEMPLATES: NotebookTemplate[] = [
  {
    id: 'trading_plan',
    label: 'Trading plan',
    title: 'Trading plan',
    content: `# Trading plan

## Markets & sessions
- Instruments I trade:
- Killzones I trade:

## A+ setups
- Setup 1 — confluence:
- Setup 2 — confluence:

## Risk rules
- Max risk per trade:
- Max trades per day:
- Daily loss limit:

## Pre-session checklist
- [ ] HTF bias logged
- [ ] Key levels marked
- [ ] News checked
- [ ] Calm and rested

> The plan is the edge. Trade the plan, not the feeling.`,
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    title: 'Watchlist',
    content: `# Watchlist

## Longs
- **EURUSD** — bias: , key level: , trigger:
- **XAUUSD** — bias: , key level: , trigger:

## Shorts
- **GBPUSD** — bias: , key level: , trigger:

## Notes
- `,
  },
  {
    id: 'weekly_review',
    label: 'Weekly review',
    title: 'Weekly review',
    content: `# Weekly review

## By the numbers
- Trades taken:
- Win rate / expectancy:
- Cleanest day / worst day:

## What I did well
-

## What broke down
-

## One change for next week
-

> Grade the process, not the P&L.`,
  },
]

export function findTemplate(id: string | null): NotebookTemplate | undefined {
  return id ? NOTEBOOK_TEMPLATES.find((t) => t.id === id) : undefined
}
