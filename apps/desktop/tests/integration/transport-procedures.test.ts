// @vitest-environment node
//
// Contract test for the `Procedures` catalog (CLAUDE.md §3.6, Stage 18.7):
// `PROCEDURE_NAMES` must name exactly the renderer-facing IPC channels registered
// via `ipcMain.handle` — no more, no less. This is a pure registration/naming-
// completeness check (the handlers keep validating inputs with their existing local
// Zod schemas; nothing here duplicates that validation).
//
// We scan source rather than calling `setupIpcHandlers()` directly: registering the
// real handlers transitively touches ~15 main-process services (session, sync,
// broker, db, keychain, ...), and mocking that whole graph just to read off channel
// names would be a heavier, more fragile surface than the thing it verifies.
//
// Scan scope: `electron/ipc/**` (the vast majority of handlers, registered via
// `setupIpcHandlers()`) plus `electron/main.ts`, which registers one renderer-facing
// channel directly — `backup:reschedule` (re-exposes `scheduleBackups()` so a Settings
// change takes effect immediately, registered post-`app.whenReady` alongside other
// startup wiring rather than in the `electron/ipc/backup.ts` handler group).

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { PROCEDURE_NAMES } from '../../shared/types/procedures'

const IPC_DIR = join(__dirname, '../../electron/ipc')
const MAIN_FILE = join(__dirname, '../../electron/main.ts')

/**
 * `backup:runScheduled` is registered (electron/ipc/backup.ts) but never exposed on
 * `window.api` — it's the main process's own scheduled-backup trigger, invoked only
 * via `ipcRenderer.invoke` from within the main process's own scheduler, never from
 * renderer code. It is intentionally absent from `Procedures`.
 */
const INTERNAL_ONLY_CHANNELS = new Set(['backup:runScheduled'])

function findRegisteredChannels(): Set<string> {
  const channels = new Set<string>()
  const handleCallPattern = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/gs
  const scan = (source: string): void => {
    for (const match of source.matchAll(handleCallPattern)) {
      channels.add(match[1])
    }
  }
  for (const file of readdirSync(IPC_DIR)) {
    if (!file.endsWith('.ts')) continue
    scan(readFileSync(join(IPC_DIR, file), 'utf-8'))
  }
  scan(readFileSync(MAIN_FILE, 'utf-8'))
  return channels
}

describe('Procedures <-> ipcMain.handle registration contract', () => {
  const registered = findRegisteredChannels()
  const cataloged = new Set<string>(PROCEDURE_NAMES)

  it('finds at least one registered channel (sanity check on the scan itself)', () => {
    expect(registered.size).toBeGreaterThan(100)
  })

  it('every cataloged Procedures entry has a registered ipcMain.handle channel', () => {
    const missingHandlers = [...cataloged].filter((name) => !registered.has(name))
    expect(missingHandlers).toEqual([])
  })

  it('every registered channel is cataloged in Procedures (or explicitly internal-only)', () => {
    const undocumented = [...registered].filter(
      (name) => !cataloged.has(name) && !INTERNAL_ONLY_CHANNELS.has(name),
    )
    expect(undocumented).toEqual([])
  })

  it('the internal-only allowlist contains only channels that are actually registered and uncataloged', () => {
    for (const name of INTERNAL_ONLY_CHANNELS) {
      expect(registered.has(name)).toBe(true)
      expect(cataloged.has(name)).toBe(false)
    }
  })

  it('PROCEDURE_NAMES has no duplicate entries', () => {
    expect(cataloged.size).toBe(PROCEDURE_NAMES.length)
  })
})
