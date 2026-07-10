import { join } from 'path'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import log from 'electron-log'
import { getBackupSettings } from './ipc/backup'
import { setupIpcHandlers } from './ipc/index'
import { runScheduledLocalBackup, createBackup } from './services/backup-service'
import { startCtraderBridge, startMt5Bridge } from './services/broker/index'
import { setGuardrailSink } from './services/rules-engine/guardrail'
import { runSelfHealing, installCrashHandlers } from './services/self-healing'
import { getActiveSyncRunner } from './services/sync'
import { initMainTelemetry } from './services/telemetry'

// Install crash handlers immediately — before anything else can fail
installCrashHandlers()

// Electron's setuid sandbox helper can't run from an AppImage's read-only SquashFS
// mount, so it prints a "running as root without --no-sandbox" warning (and may fail)
// on every launch. AppImage's runtime sets APPIMAGE, so disable the sandbox cleanly
// only in that case — Windows, macOS, and non-AppImage Linux packages keep it.
if (process.platform === 'linux' && process.env['APPIMAGE']) {
  app.commandLine.appendSwitch('no-sandbox')
}

log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// Wire the rules-engine's guardrail-degraded sink to the real world: log it
// (electron-log, so it survives even with no window open) and broadcast it to
// every window over the existing `cairn:event` channel, exactly like the
// broker/sync services do (services/broker/index.ts#broadcast,
// services/sync/activate.ts#notify). Registered before any window opens so no
// early degradation is missed. The rules engine itself stays free of
// `electron`/`electron-log` imports so it remains directly unit-testable.
setGuardrailSink(({ ruleKey, reason }) => {
  log.error(
    `[rules-engine] guardrail degraded — rule "${ruleKey}" is not being enforced: ${reason}`,
  )
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send('cairn:event', {
        name: 'guardrail.degraded',
        payload: { ruleKey, reason },
      })
    }
  }
})

let mainWindow: BrowserWindow | null = null
let backupTimer: ReturnType<typeof setInterval> | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0E1012',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Never open a child window inside the app; hand safe external schemes to the OS
  // browser and deny everything else. Restricting the scheme means a renderer
  // compromise cannot use window.open to launch a file:/custom-protocol handler.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https:|mailto:)/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Deny in-page navigation to any remote origin. Production loads a local file and
  // never navigates; the dev server (loadURL) is the only allowed non-file origin.
  // This stops a renderer bug from pointing the window at a remote page, which would
  // then run with the app's privileges.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const isDevNav = !app.isPackaged && devUrl !== undefined && url.startsWith(devUrl)
    if (!isDevNav && !url.startsWith('file://')) {
      event.preventDefault()
      log.warn(`[main] blocked navigation to a non-app URL`)
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Sync on window focus (docs/sync-protocol.md §10): a gentle extra trigger so coming
  // back to the app reconciles promptly. No-op until a session has wired the runner; the
  // runner itself ignores focus while paused.
  mainWindow.on('focus', () => {
    getActiveSyncRunner()?.onFocus()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  log.info('Main window created')
}

function scheduleBackups(): void {
  if (backupTimer) clearInterval(backupTimer)

  try {
    const settings = getBackupSettings()
    if (settings.schedule !== 'daily') return

    // Parse HH:MM and compute ms until next occurrence
    const [hh = 2, mm = 0] = (settings.dailyTime ?? '02:00').split(':').map(Number)
    const msUntilNext = (): number => {
      const now = new Date()
      const next = new Date()
      next.setUTCHours(hh, mm, 0, 0)
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
      return next.getTime() - now.getTime()
    }

    const fireAndReschedule = (): void => {
      runScheduledLocalBackup()
      backupTimer = setTimeout(fireAndReschedule, msUntilNext()) as unknown as ReturnType<
        typeof setInterval
      >
    }

    backupTimer = setTimeout(fireAndReschedule, msUntilNext()) as unknown as ReturnType<
      typeof setInterval
    >
    log.info(`[backup] Daily backup scheduled at ${settings.dailyTime} UTC`)
  } catch (err) {
    log.warn('[backup] Failed to schedule backup (non-fatal):', err)
  }
}

void app.whenReady().then(() => {
  setupIpcHandlers()
  // Opt-in crash telemetry. No-op unless the user enabled it AND a DSN is set
  // (§2.4). Runs after IPC/DB are reachable so the opt-in flag can be read.
  initMainTelemetry()
  createWindow()

  // Run self-healing (items 3–10 from §13.11)
  try {
    runSelfHealing(mainWindow)
  } catch (err) {
    // Version downgrade is a fatal error; surface it to the user
    log.error('[main] Self-healing fatal error:', err)
    void import('electron').then(({ dialog }) => {
      void dialog.showErrorBox('Cairn — Startup Error', String(err))
      app.quit()
    })
    return
  }

  scheduleBackups()

  // Start the read-only MT5 loopback bridge (docs/broker-integration.md §2.1).
  // Non-fatal: a bind failure is logged inside and the app continues.
  void startMt5Bridge()

  // Resume the read-only cTrader Open API stream if an account is already linked
  // (docs/broker-integration.md §2.2). Non-fatal: logged inside, app continues.
  void startCtraderBridge()

  // Re-expose scheduleBackups so backup settings changes take effect immediately
  ipcMain.handle('backup:reschedule', () => {
    scheduleBackups()
    return { ok: true, data: undefined }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  // Item: backup on close (if configured)
  try {
    const settings = getBackupSettings()
    if (settings.backupOnClose) {
      const destDir = settings.folder ?? join(app.getPath('userData'), 'cairn', 'backups', 'local')
      createBackup('auto_local', destDir)
      log.info('[backup] On-close backup created')
    }
  } catch (err) {
    log.warn('[backup] On-close backup failed (non-fatal):', err)
  }
})

app.on('window-all-closed', () => {
  if (backupTimer) clearTimeout(backupTimer as unknown as ReturnType<typeof setTimeout>)
  if (process.platform !== 'darwin') app.quit()
})
