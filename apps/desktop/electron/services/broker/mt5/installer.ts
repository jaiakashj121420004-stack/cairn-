/**
 * One-click MT5 EA installation (Wave 4 — `docs/broker-integration.md` §2.1).
 *
 * Copies the bundled `CairnBridge.mq5` (plus its compiled `CairnBridge.ex5` when a
 * build ships one) into every discovered `MQL5/Experts` folder, so a trader never
 * has to hand-copy the file out of the app's resources.
 *
 * Read-only + no arbitrary-path sink (CLAUDE.md §2.13 / §19): the destinations come
 * exclusively from {@link findMt5ExpertsPaths} (folders Cairn itself detected), never
 * from the renderer. {@link revealMt5ExpertsFolder} re-checks its argument against
 * that same allow-list before opening it, so neither entry point can be steered to
 * an attacker-chosen path. Main-process only.
 */

import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'
import { err, ok } from '@cairn/shared-types'
import { shell } from 'electron'
import { findMt5ExpertsPaths } from './config'
import type { Mt5EaInstallResult, Result } from '@cairn/shared-types'

/** The EA source file that must ship in the `mt5-bridge` resource bundle. */
const EA_SOURCE_FILE = 'CairnBridge.mq5'

/** Optional pre-compiled EA — copied too when a build provides it (skips MetaEditor). */
const EA_COMPILED_FILE = 'CairnBridge.ex5'

/**
 * Locate the bundled `mt5-bridge` resource directory for the current runtime.
 *
 * Mirrors `resolveProtoDir()` in `ctrader/connection.ts` and the DB-migrations
 * resolution in `electron/db/index.ts`: in a packaged build the folder is copied
 * beside the asar as an `extraResource` (`<resources>/mt5-bridge`, see
 * `electron-builder.yml`); in dev/built-but-unpackaged runs `__dirname` is
 * `out/main/`, so the source tree's `resources/mt5-bridge` is two levels up.
 */
export function resolveMt5BridgeDir(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (__dirname.includes('app.asar') && resourcesPath) {
    return join(resourcesPath, 'mt5-bridge')
  }
  return join(__dirname, '..', '..', 'resources', 'mt5-bridge')
}

/** Absolute path to the bundled EA source, whether or not it currently exists. */
export function mt5EaSourcePath(): string {
  return join(resolveMt5BridgeDir(), EA_SOURCE_FILE)
}

/** Test seam for {@link installMt5Ea}: override the resolved source dir / targets. */
export interface InstallMt5EaOptions {
  /** Bundled EA source directory. Defaults to {@link resolveMt5BridgeDir}. */
  readonly sourceDir?: string
  /** Destination `MQL5/Experts` folders. Defaults to {@link findMt5ExpertsPaths}. */
  readonly targets?: readonly string[]
}

/**
 * Copy the bundled EA into every discovered `MQL5/Experts` folder.
 *
 * Fails (as a `Result` error) only when the action cannot start at all — the bundled
 * EA is missing (a packaging regression) or no MT5 terminal was found. Once at least
 * one destination exists it always succeeds, reporting any per-folder copy failure in
 * `data.failures` rather than throwing, so one locked terminal never blocks the rest.
 */
export function installMt5Ea(options: InstallMt5EaOptions = {}): Result<Mt5EaInstallResult> {
  const sourceDir = options.sourceDir ?? resolveMt5BridgeDir()
  const source = join(sourceDir, EA_SOURCE_FILE)
  if (!existsSync(source)) {
    return err(
      'MT5_EA_SOURCE_MISSING',
      `The Cairn EA is missing from this build. Reinstall Cairn, or copy ${EA_SOURCE_FILE} manually.`,
    )
  }

  const targets = options.targets ?? findMt5ExpertsPaths()
  if (targets.length === 0) {
    return err(
      'MT5_NO_EXPERTS_FOUND',
      'No MetaTrader 5 terminal was found on this machine. Open MT5 once, then try again — or copy the EA manually.',
    )
  }

  // Include the compiled .ex5 when a build ships one so users can skip MetaEditor.
  const compiled = join(sourceDir, EA_COMPILED_FILE)
  const files: readonly { readonly name: string; readonly from: string }[] = existsSync(compiled)
    ? [
        { name: EA_SOURCE_FILE, from: source },
        { name: EA_COMPILED_FILE, from: compiled },
      ]
    : [{ name: EA_SOURCE_FILE, from: source }]

  const installedPaths: string[] = []
  const failures: { path: string; error: string }[] = []
  for (const dir of targets) {
    try {
      for (const file of files) copyFileSync(file.from, join(dir, file.name))
      installedPaths.push(dir)
    } catch (e) {
      failures.push({ path: dir, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return ok({
    installedPaths,
    failures,
    copiedFiles: files.map((f) => f.name),
  })
}

/**
 * Open a discovered `MQL5/Experts` folder in the OS file manager.
 *
 * The path MUST be one Cairn itself discovered ({@link findMt5ExpertsPaths}); a
 * renderer-supplied arbitrary path is rejected, so this exposes no open-anything
 * sink (CLAUDE.md §2.13).
 */
export async function revealMt5ExpertsFolder(path: string): Promise<Result<void>> {
  if (!findMt5ExpertsPaths().includes(path)) {
    return err(
      'MT5_PATH_NOT_RECOGNISED',
      'That folder is not a detected MetaTrader Experts folder.',
    )
  }
  const problem = await shell.openPath(path)
  if (problem) return err('MT5_OPEN_FAILED', problem)
  return ok(undefined)
}
