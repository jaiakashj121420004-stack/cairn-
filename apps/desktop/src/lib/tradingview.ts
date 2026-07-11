// TradingView embed helpers (P3). Pure and deterministic so the URL construction
// is unit-tested. The chart renders in a SANDBOXED iframe (see TradingViewChart) —
// only TradingView's `/widgetembed/` endpoint is used, so their JavaScript runs
// inside TradingView's own frame, never our document. The app CSP therefore only
// needs `frame-src` for tradingview.com (no `script-src` loosening; see
// electron.vite.config.ts). This keeps the P1 CSP hardening intact.

export type TvInterval = '15' | '60' | '240' | 'D'
export type TvTheme = 'light' | 'dark'

export const TV_INTERVALS: { value: TvInterval; label: string }[] = [
  { value: '15', label: '15m' },
  { value: '60', label: '1H' },
  { value: '240', label: '4H' },
  { value: 'D', label: '1D' },
]

/**
 * Best-effort map from a Cairn pair symbol to a TradingView symbol. Cairn stores
 * bare tickers (e.g. "EURUSD"); TradingView resolves those and shows a picker if
 * it cannot. An explicit "EXCHANGE:TICKER" the user configured is left untouched.
 */
export function toTradingViewSymbol(pairSymbol: string): string {
  const s = pairSymbol.trim().toUpperCase()
  if (s.includes(':')) return s
  return s.replace(/[\s/]/g, '')
}

/** The sandboxed-iframe src for the embedded advanced chart. */
export function buildTradingViewEmbedUrl(opts: {
  symbol: string
  interval: TvInterval
  theme: TvTheme
}): string {
  const params = new URLSearchParams({
    symbol: toTradingViewSymbol(opts.symbol),
    interval: opts.interval,
    theme: opts.theme,
    style: '1',
    timezone: 'Etc/UTC',
    locale: 'en',
    hideideas: '1',
    hidesidetoolbar: '0',
  })
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`
}

/** Full-site chart URL for the "Open on TradingView" link (opens externally). */
export function tradingViewChartUrl(pairSymbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
    toTradingViewSymbol(pairSymbol),
  )}`
}
