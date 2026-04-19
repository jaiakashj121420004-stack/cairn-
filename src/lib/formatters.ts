// §4.3 number formatting rules — all stored values are integers
// Money: integer cents (100 per dollar). Pips: integer tenths. R: integer hundredths. Percent: integer basis points.

export function formatCents(cents: number): string {
  const dollars = Math.abs(cents) / 100
  const formatted = dollars.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return cents < 0 ? `-$${formatted}` : `$${formatted}`
}

export function formatRMultiple(rHundredths: number): string {
  const sign = rHundredths >= 0 ? '+' : ''
  return `${sign}${(rHundredths / 100).toFixed(2)}R`
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`
}

export function formatPips(tenths: number): string {
  return `${(tenths / 10).toFixed(1)} pips`
}

export function formatTimestamp(ms: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', ...opts }).format(new Date(ms))
}

export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(ms))
}
