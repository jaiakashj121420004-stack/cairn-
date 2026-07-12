/**
 * Brand + support constants — single source (launch-checklist #10, #29).
 *
 * The `cairn.app` URLs are PLACEHOLDERS. Update them to the real domain at go-live (see
 * `docs/go-live-checklist.md`). Links open in the OS browser / mail client via `window.open`,
 * which `electron/main.ts`'s window-open handler permits only for `https:` and `mailto:` —
 * so a renderer bug can never reach a `file:`/custom-protocol handler (§2.13).
 */
export const SUPPORT_EMAIL = 'support@cairn.app'
export const PRIVACY_URL = 'https://cairn.app/privacy'
export const TERMS_URL = 'https://cairn.app/terms'
export const STATUS_URL = 'https://status.cairn.app'

/** Build a prefilled bug-report `mailto:` with light, non-sensitive diagnostics. */
export function buildFeedbackMailto(): string {
  const subject = encodeURIComponent('Cairn feedback / bug report')
  const platform = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  const body = encodeURIComponent(
    `What happened:\n\n\nWhat you expected:\n\n\nSteps to reproduce:\n\n\n---\nPlatform: ${platform}`,
  )
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}
