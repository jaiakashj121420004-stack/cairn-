/**
 * Smoke E2E — Wave 0 quality gate
 *
 * Path covered:
 *   launch app  →  complete onboarding  →  log session bias
 *   →  place market trade  →  close trade  →  Analytics confirms 1 trade
 *
 * Precondition: run `pnpm build` before this suite.
 * Each run uses a throwaway temp directory for the SQLite database so tests
 * never share state and leave no permanent files.
 *
 * Failure at any step is intentionally loud: Playwright throws on the first
 * `expect` that does not resolve within its timeout.
 */

import { test, expect, _electron as electron } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Path to the Electron main-process entry produced by `pnpm build`. */
const MAIN_JS = path.resolve(__dirname, '..', '..', 'out', 'main', 'main.js')

/** Click a custom Select trigger whose current text matches `placeholder`. */
async function openSelect(page: import('@playwright/test').Page, placeholder: string) {
  await page
    .locator('button[aria-haspopup="listbox"]')
    .filter({ hasText: placeholder })
    .click()
}

/**
 * In a YesNo component, click the button corresponding to `answer` for the
 * question whose label matches `questionText`.
 *
 * HTML structure:
 *   <p>questionText</p>
 *   <div class="flex gap-2"><button>Yes</button><button>No</button></div>
 */
async function answerYesNo(
  page: import('@playwright/test').Page,
  questionText: string,
  answer: 'Yes' | 'No',
) {
  await page
    .locator('p', { hasText: questionText })
    .locator('xpath=following-sibling::div')
    .getByRole('button', { name: answer })
    .click()
}

// ── Test ─────────────────────────────────────────────────────────────────────

test('smoke: onboard → session bias → place trade → close trade → analytics', async () => {
  // Each run gets a pristine SQLite database in a throwaway OS temp directory.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-smoke-'))

  const app = await electron.launch({
    args: [MAIN_JS, `--user-data-dir=${tmpDir}`],
  })

  const page = await app.firstWindow()
  // Reduced-motion makes the app set MotionGlobalConfig.skipAnimations = true, so all
  // Framer Motion animations complete instantly. Without this, spring/AnimatePresence
  // transitions leave modal elements perpetually "unstable" for Playwright in Electron.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Capture any renderer-process console errors during the run.
  page.on('pageerror', (err) => console.error('[renderer]', err))

  try {
    // ── 1. ONBOARDING ─────────────────────────────────────────────────────────

    // Step 0 — Welcome
    await expect(page.getByText('Trade the plan, not the emotion.')).toBeVisible()
    await page.getByRole('button', { name: 'Get started' }).click()

    // Step 1 — Prop firm
    await expect(page.getByText('Name your prop firm.')).toBeVisible()
    await page.getByPlaceholder('e.g. FTMO, My Forex Funds').fill('Test Firm')
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 2 — Template (skip)
    await expect(page.getByText('Define the account template.')).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()

    // Step 3 — Account
    await expect(page.getByText('Create your first account.')).toBeVisible()
    await page.getByPlaceholder('e.g. Phase 1 — Jan 2026').fill('Smoke Account')
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 4 — Review defaults
    await expect(page.getByText('Default pairs, setups, and killzones.')).toBeVisible()
    await page.getByRole('button', { name: 'Looks good' }).click()

    // Step 5 — Theme
    await expect(page.getByText('Choose your theme.')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 6 — Backup (skip)
    await expect(page.getByText('Where should Cairn back up your data?')).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()

    // Step 7 — Done
    await expect(page.getByText("You're set up.")).toBeVisible()
    await page.getByRole('button', { name: 'Open dashboard' }).click()

    // ── 2. DASHBOARD ──────────────────────────────────────────────────────────

    // Wait for the dashboard heading and account name badge to confirm full load.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    // The account selector button shows the account name, confirming selectedAccountId is set.
    await expect(page.getByRole('button', { name: 'Smoke Account' })).toBeVisible()

    // ── 3. LOG SESSION BIAS ───────────────────────────────────────────────────

    // Open the session bias modal via the header button.
    await page.getByRole('button', { name: 'Log Bias' }).first().click()
    const biasDialog = page.locator('[role="dialog"]')
    await expect(biasDialog.getByText('Log Session Bias')).toBeVisible()

    // "Bullish" appears for Daily / 4H / 1H / DXY — scope to the dialog and index by row.
    // Daily bias — Bullish
    await biasDialog.getByRole('button', { name: 'Bullish' }).nth(0).click()
    await page.getByPlaceholder('Why daily bias is bullish').fill('London price action bullish')

    // 4H bias — Bullish
    await biasDialog.getByRole('button', { name: 'Bullish' }).nth(1).click()
    await page.getByPlaceholder('Why 4h bias is bullish').fill('4H order block respected')

    // 1H bias — Bullish
    await biasDialog.getByRole('button', { name: 'Bullish' }).nth(2).click()
    await page.getByPlaceholder('Why 1h bias is bullish').fill('1H structure trending up')

    await biasDialog.getByRole('button', { name: 'Log session' }).click()
    await expect(page.getByText('Session bias logged.')).toBeVisible({ timeout: 8_000 })

    // ── 4. PLACE A TRADE ──────────────────────────────────────────────────────

    // Disable two-phase fast-path so this smoke run exercises the FULL single-phase
    // flow (setup, MSS, and the honesty review at close). The fast-path/reflection
    // lifecycle has dedicated coverage in tests/integration/two-phase-logging.test.ts.
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Fast path (two-phase logging)')).toBeVisible()
    await page.getByRole('switch').click()
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('button', { name: 'New Trade' }).click()
    // Wait for the pre-trade panel to slide in (Framer Motion).
    await expect(page.getByText('New Trade', { exact: false }).nth(1)).toBeVisible()

    // Pair — EURUSD (searchable select)
    await openSelect(page, 'Select pair…')
    await page.getByPlaceholder('Search…').fill('EURUSD')
    await page.getByRole('option', { name: /EURUSD/ }).click()

    // Setup — FVG
    await openSelect(page, 'Select setup…')
    await page.getByRole('option', { name: 'FVG' }).click()

    // Mode — Sim (avoids weekend/live-only rules during CI runs)
    await page.getByRole('button', { name: 'Sim' }).click()

    // Direction — Long (auto-sets HTF bias aligned since daily = Bullish)
    await page.getByRole('button', { name: 'Long' }).click()

    // Prices — 2R trade (SL 30 pips, TP 60 pips)
    await page.locator('label:text-is("Entry") + input').fill('1.08500')
    await page.locator('label:text-is("Stop loss") + input').fill('1.08200')
    await page.locator('label:text-is("Take profit") + input').fill('1.09100')

    // MSS confirmed (required by require_mss_confirmation blocking rule).
    // The input is sr-only; clicking its label toggles it.
    await page.getByText('MSS confirmed').click()

    // Invalidation — click Custom… to reveal the free-text textarea, then fill
    await page.getByRole('button', { name: 'Custom…' }).click()
    await page
      .getByPlaceholder('Describe the exact conditions that would invalidate this trade…')
      .fill('If price closes back below the order block')

    // Submit — triggers broker confirmation modal
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByText('Order placed in broker?')).toBeVisible()
    await page.getByRole('button', { name: "Yes, it's placed" }).click()

    await expect(page.getByText('Trade open.')).toBeVisible({ timeout: 8_000 })

    // ── 5. CLOSE THE TRADE ────────────────────────────────────────────────────

    // Navigate to Trade Log via sidebar.
    await page.getByRole('link', { name: 'Trade Log' }).click()
    // Wait for the page to load and show the open trade row.
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Close' }).first().click()
    await expect(page.getByText(/Close Trade —/)).toBeVisible()

    // Exit price (required)
    await page.getByPlaceholder('e.g. 1.0842').fill('1.09100')

    // Exit reason (required)
    await page.getByRole('button', { name: 'Take Profit hit' }).click()

    // Honesty questions (all required for full close)
    await answerYesNo(page, 'Did you follow your plan exactly?', 'Yes')
    await answerYesNo(page, 'Did you move your SL?', 'No')
    await answerYesNo(page, 'Did you enter before MSS was confirmed?', 'No')

    await page.getByRole('button', { name: 'Close trade' }).click()
    await expect(page.getByText('Trade closed.')).toBeVisible({ timeout: 8_000 })

    // ── 6. ANALYTICS — CONFIRM TRADE APPEARS ─────────────────────────────────

    await page.getByRole('link', { name: 'Analytics' }).click()

    // The Performance tab is the default. With 1 closed trade the stat grid
    // renders; the empty-state text must NOT be visible.
    await expect(page.getByText('No trades in this range')).not.toBeVisible({ timeout: 15_000 })

    // The "Trades" StatCard with value "1" must be present.
    await expect(page.getByText('Trades')).toBeVisible()
    // The value cell adjacent to the "Trades" label shows "1".
    await expect(
      page
        .locator('p', { hasText: 'Trades' })
        .locator('xpath=following-sibling::p'),
    ).toHaveText('1')

    // ── 7. FAST-PATH GATE — re-enable and place via the six gate fields ───────
    // Re-enable two-phase fast-path, then place a trade using ONLY the gate
    // fields. This proves the Gate has no hidden/blocking steps — the structural
    // guarantee behind the ≤20 s target (the human stopwatch check). Playwright
    // types instantly, so the elapsed time bounds app responsiveness, not human
    // think-time; the real win is that no full-form field is required to submit.
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Fast path (two-phase logging)')).toBeVisible()
    await page.getByRole('switch').click() // back on
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 8_000 })
    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const gateStart = Date.now()
    await page.getByRole('button', { name: 'New Trade' }).click()
    await expect(page.getByText('New Trade', { exact: false }).nth(1)).toBeVisible()

    // Pair pre-fills from the last trade (Wave 1 context); set it explicitly to
    // be deterministic regardless of prefill.
    const pairTrigger = page.locator('button[aria-haspopup="listbox"]').filter({ hasText: /Select pair…|EURUSD/ })
    await pairTrigger.click()
    await page.getByPlaceholder('Search…').fill('EURUSD')
    await page.getByRole('option', { name: /EURUSD/ }).click()

    // Direction Short (different from the earlier Long trade → no duplicate guard).
    await page.getByRole('button', { name: 'Short' }).click()
    // Prices — short 2R (SL 30 pips above, TP 60 pips below)
    await page.locator('label:text-is("Entry") + input').fill('1.08500')
    await page.locator('label:text-is("Stop loss") + input').fill('1.08800')
    await page.locator('label:text-is("Take profit") + input').fill('1.07900')
    // One MSS tap (required by the blocking MSS rule — the gate does not skip it).
    await page.getByText('MSS confirmed').click()
    // One invalidation chip (satisfies the 20-char honesty gate in one tap).
    await page.getByRole('button', { name: 'Liquidity sweep fails to reverse' }).click()
    // One emotion preset.
    await page.getByRole('button', { name: 'Focused' }).click()

    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByText('Order placed in broker?')).toBeVisible()
    await page.getByRole('button', { name: "Yes, it's placed" }).click()
    await expect(page.getByText('Trade open.')).toBeVisible({ timeout: 8_000 })
    const gateElapsed = Date.now() - gateStart
    expect(gateElapsed).toBeLessThan(20_000)
  } finally {
    await app.close()
    // Clean up temp data directory; ignore errors (process may have locked files on Windows).
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
})
