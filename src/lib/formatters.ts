// Display formatters — implemented in design system phase (§13.12 build order step 4)
// All money values are stored as integer cents; formatters convert to display strings.
// See §4.3 number formatting rules.

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatRMultiple(rHundredths: number): string {
  const sign = rHundredths >= 0 ? '+' : ''
  return `${sign}${(rHundredths / 100).toFixed(2)}R`
}

export function formatPercent(basisPoints: number): string {
  const sign = basisPoints >= 0 ? '' : ''
  return `${sign}${(basisPoints / 100).toFixed(2)}%`
}

export function formatPips(tenths: number): string {
  return `${(tenths / 10).toFixed(1)} pips`
}
