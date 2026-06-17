import { create } from 'zustand'

/**
 * Global "you need Cairn Pro" prompt state (CLAUDE.md §2.14, §20, task §5).
 *
 * A single store the whole app subscribes to. {@link HttpCore} fires `onUpgradeRequired`
 * whenever a call maps to `UPGRADE_REQUIRED` / `PAYMENT_REQUIRED` (a `/vault/*` 402); the
 * transport forwards that here via {@link triggerUpgrade}, which flips `open` so the
 * mounted `<UpgradeModal />` shows. The `upgradeUrl` is the server-provided deep link to
 * the pricing page (docs/billing.md §5), defaulting to the in-app `/pricing` route.
 */

interface UpgradeState {
  open: boolean
  /** Server-provided upgrade deep link, or the in-app pricing route. */
  upgradeUrl: string
  show: (upgradeUrl?: string) => void
  dismiss: () => void
}

export const useUpgradePrompt = create<UpgradeState>((set) => ({
  open: false,
  upgradeUrl: '/pricing',
  show: (upgradeUrl) => set({ open: true, upgradeUrl: upgradeUrl ?? '/pricing' }),
  dismiss: () => set({ open: false }),
}))

/**
 * Pull a usable upgrade URL out of the server's error `details` and open the modal.
 * The 402 envelope carries `details.upgrade_url` (docs/billing.md §5); anything else
 * falls back to the in-app pricing page.
 */
export function triggerUpgrade(details: unknown): void {
  let url = '/pricing'
  if (details !== null && typeof details === 'object' && 'upgrade_url' in details) {
    const candidate = (details as { upgrade_url?: unknown }).upgrade_url
    if (typeof candidate === 'string' && candidate.length > 0) url = candidate
  }
  useUpgradePrompt.getState().show(url)
}
