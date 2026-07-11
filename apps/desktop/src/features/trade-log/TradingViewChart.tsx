import { ExternalLink, LineChart } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui'
import { cn } from '../../lib/cn'
import { TV_INTERVALS, buildTradingViewEmbedUrl, tradingViewChartUrl } from '../../lib/tradingview'
import type { TvInterval, TvTheme } from '../../lib/tradingview'

/**
 * Embedded TradingView advanced chart for reviewing a trade (P3). The chart lives
 * in a sandboxed cross-origin iframe, so TradingView's code runs in their frame —
 * never Cairn's document (the P1 CSP only allows `frame-src` for tradingview.com,
 * not `script-src`). The iframe is not loaded until the trader clicks "Show chart",
 * so nothing is fetched from TradingView unless they opt in.
 *
 * Cairn is not a charting tool (CLAUDE.md §1) — this is review context only, with a
 * plain "Open on TradingView" link (routed to the external browser by the main
 * process) for the full site.
 */
function currentTheme(): TvTheme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function TradingViewChart({ symbol }: { symbol: string }) {
  const [shown, setShown] = useState(false)
  const [tvInterval, setTvInterval] = useState<TvInterval>('60')

  if (!shown) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption text-text-muted">Review this trade on a TradingView chart.</p>
        <Button variant="secondary" size="sm" onClick={() => setShown(true)}>
          <LineChart className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
          Show chart
        </Button>
      </div>
    )
  }

  const src = buildTradingViewEmbedUrl({ symbol, interval: tvInterval, theme: currentTheme() })

  return (
    <div className="space-y-2" data-testid="tradingview-chart">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {TV_INTERVALS.map((iv) => (
            <button
              key={iv.value}
              type="button"
              onClick={() => setTvInterval(iv.value)}
              className={cn(
                'rounded-md px-2 py-0.5 text-caption transition-colors',
                tvInterval === iv.value
                  ? 'bg-accent-a/15 text-accent-a'
                  : 'text-text-muted hover:text-text-primary',
              )}
            >
              {iv.label}
            </button>
          ))}
        </div>
        <a
          href={tradingViewChartUrl(symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-caption text-text-muted transition-colors hover:text-text-primary"
        >
          Open on TradingView
          <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
        </a>
      </div>
      <iframe
        key={src}
        src={src}
        title={`TradingView chart for ${symbol}`}
        sandbox="allow-scripts allow-same-origin allow-popups"
        className="h-[420px] w-full rounded-[10px] border border-border"
      />
    </div>
  )
}
