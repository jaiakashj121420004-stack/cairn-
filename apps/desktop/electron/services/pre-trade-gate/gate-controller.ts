/**
 * Pre-trade gate controller (P0.7 slice 4, main process only).
 *
 * The brain that ties the EA chart controls to the frameless overlay window and
 * the plan store:
 *   - on `gate.intent` (trader clicked Cairn Buy/Sell): resolve the broker account
 *     + symbol to a Cairn (account, pair), open the overlay, and stream the intent
 *     to it; also tell the EA to draw the default SL/TP lines.
 *   - on `gate.levels` (SL/TP dragged): forward the live levels to the overlay.
 *   - `gateConfirmPlan` / `gateBreachRules`: entitlement-gated, write the plan via
 *     the Slice-1 store and hide the overlay.
 *
 * Paid feature: everything here is gated by {@link isPreTradeGateEntitled}. A free
 * user still gets read-only fill capture (unchanged) — they just never see the gate
 * UI, and cannot create plans.
 *
 * Uses Electron (`BrowserWindow`), so it is main-process only and not unit-tested
 * in the node env — the plan-store/matcher/outcome logic it calls is fully tested.
 */
import { join } from 'path'
import { err, ok } from '@cairn/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { getDb } from '../../db/index'
import * as schema from '../../db/schema'
import { getSessionStore } from '../session'
import { canUsePreTradeGate } from './entitlement'
import { createBreachAckIntent, createCompliantPlan, getGateConfig } from './plan-store'
import type { BreachAckInput, CompliantPlanInput } from './plan-store'
import type { GateCommand, GateSignal } from '../broker/mt5/frame'
import type { Result } from '@cairn/shared-types'

/** The intent the overlay renders, resolved to Cairn ids. */
export interface GateIntentContext {
  readonly accountId: string
  readonly pairId: string
  readonly symbol: string
  readonly direction: 'long' | 'short'
  readonly price: number
}

let overlay: BrowserWindow | null = null
let eaSender: ((command: GateCommand) => boolean) | null = null
let currentIntent: GateIntentContext | null = null

/** Register the adapter's Cairn→EA sender so the controller can draw chart lines. */
export function setGateEaSender(fn: ((command: GateCommand) => boolean) | null): void {
  eaSender = fn
}

/** The paid-feature gate — offline, off the cached session entitlement (§2.14). */
export function isPreTradeGateEntitled(): boolean {
  const entitlement = getSessionStore().getSession()?.entitlement ?? 'free'
  return canUsePreTradeGate(entitlement)
}

/** The intent the overlay is currently working on (for a fresh window to hydrate). */
export function getCurrentGateIntent(): GateIntentContext | null {
  return currentIntent
}

/** Resolve a broker (account, symbol) to a Cairn (account, pair), or null. */
function resolveContext(
  brokerAccountId: string,
  symbol: string,
): { accountId: string; pairId: string } | null {
  const db = getDb()
  const binding = db
    .select({ cairnAccountId: schema.brokerAccountMap.cairnAccountId })
    .from(schema.brokerAccountMap)
    .where(
      and(
        eq(schema.brokerAccountMap.broker, 'mt5'),
        eq(schema.brokerAccountMap.brokerAccountId, brokerAccountId),
        isNull(schema.brokerAccountMap.deletedAt),
      ),
    )
    .get()
  if (!binding) return null
  const pair = db
    .select({ id: schema.pairs.id })
    .from(schema.pairs)
    .where(eq(schema.pairs.symbol, symbol))
    .get()
  if (!pair) return null
  return { accountId: binding.cairnAccountId, pairId: pair.id }
}

function ensureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  const win = new BrowserWindow({
    width: 380,
    height: 560,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.setMenuBarVisibility(false)
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}#gate-overlay`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'gate-overlay' })
  }
  win.on('closed', () => {
    if (overlay === win) overlay = null
  })
  overlay = win
  return win
}

function sendToOverlay(name: string, payload: unknown): void {
  // Reuse the renderer event bus (window.api.events) the overlay's preload already
  // wires up: main sends `cairn:event` with a { name, payload } envelope.
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('cairn:event', { name, payload })
  }
}

function hideOverlay(): void {
  currentIntent = null
  if (overlay && !overlay.isDestroyed()) overlay.hide()
  // Clear the EA's chart lines when the session ends.
  eaSender?.({ type: 'gate.show', show: false })
}

/** Route an inbound EA gate signal to the overlay (paid feature; free = no-op). */
export function handleGateSignal(signal: GateSignal): void {
  if (!isPreTradeGateEntitled()) return

  if (signal.kind === 'gate.intent') {
    const ctx = resolveContext(signal.brokerAccountId, signal.symbol)
    if (!ctx) {
      log.warn(
        `[gate] intent for unmapped account/symbol (${signal.brokerAccountId}/${signal.symbol})`,
      )
      return
    }
    currentIntent = {
      accountId: ctx.accountId,
      pairId: ctx.pairId,
      symbol: signal.symbol,
      direction: signal.direction,
      price: signal.price,
    }
    const win = ensureOverlay()
    win.show()
    win.focus()
    sendToOverlay('gate:intent', currentIntent)
  } else {
    // gate.levels — forward the dragged SL/TP for the live readout.
    sendToOverlay('gate:levels', {
      symbol: signal.symbol,
      price: signal.price,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    })
  }
}

/** Confirm a compliant plan from the overlay. Entitlement-gated. */
export function gateConfirmPlan(input: CompliantPlanInput): Result<{ id: string }> {
  if (!isPreTradeGateEntitled()) {
    return err('FEATURE_LOCKED', 'The pre-trade gate is a Cairn Pro feature')
  }
  try {
    const db = getDb()
    const id = createCompliantPlan(db, input, getGateConfig(db).matchWindowMs)
    hideOverlay()
    return ok({ id })
  } catch (e) {
    return err('DB_ERROR', String(e))
  }
}

/** Record an acknowledged-breach intent from the overlay. Entitlement-gated. */
export function gateBreachRules(input: BreachAckInput): Result<{ id: string }> {
  if (!isPreTradeGateEntitled()) {
    return err('FEATURE_LOCKED', 'The pre-trade gate is a Cairn Pro feature')
  }
  try {
    const db = getDb()
    const id = createBreachAckIntent(db, input, getGateConfig(db).matchWindowMs)
    hideOverlay()
    return ok({ id })
  } catch (e) {
    return err('DB_ERROR', String(e))
  }
}

/** Dismiss the overlay without recording anything (the trader cancelled). */
export function gateDismiss(): void {
  hideOverlay()
}
