import {
  PRIVACY_URL,
  STATUS_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
  buildFeedbackMailto,
} from '../../lib/brand'

/**
 * Help & Legal (launch-checklist #15 in-app feedback path + #29 reachable legal links).
 *
 * Links open in the OS browser / mail client via `window.open`. The main-process
 * window-open handler (`electron/main.ts`) permits only `https:` and `mailto:` and denies
 * the in-app window, so this can't be used to reach a `file:`/custom scheme (§2.13).
 */
function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function HelpLegalCard() {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-6">
      <h3 className="text-caption font-medium text-text-secondary">Help &amp; Legal</h3>
      <button
        type="button"
        onClick={() => {
          openExternal(buildFeedbackMailto())
        }}
        className="w-fit rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-body text-text-primary hover:border-accent-a"
      >
        Report a bug / send feedback
      </button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
        <button
          type="button"
          onClick={() => {
            openExternal(PRIVACY_URL)
          }}
          className="text-accent-a hover:underline"
        >
          Privacy Policy
        </button>
        <button
          type="button"
          onClick={() => {
            openExternal(TERMS_URL)
          }}
          className="text-accent-a hover:underline"
        >
          Terms of Service
        </button>
        <button
          type="button"
          onClick={() => {
            openExternal(STATUS_URL)
          }}
          className="text-accent-a hover:underline"
        >
          Status
        </button>
      </div>
      <p className="text-caption text-text-muted">
        Support: <span className="text-text-secondary">{SUPPORT_EMAIL}</span>
      </p>
    </div>
  )
}
