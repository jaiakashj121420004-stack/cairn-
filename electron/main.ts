import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { setupIpcHandlers } from './ipc/index'
import { runSelfHealing, installCrashHandlers } from './services/self-healing'
import { getBackupSettings } from './ipc/backup'
import { runScheduledLocalBackup, createBackup } from './services/backup-service'

// Install crash handlers immediately — before anything else can fail
installCrashHandlers()

log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
  log.info('Main window created')
}

function scheduleBackups(): void {
  if (backupTimer) clearInterval(backupTimer)

  try {
    const settings = getBackupSettings()
    if (settings.schedule !== 'daily') return

    // Parse HH:MM and compute ms until next occurrence
    const [hh = 2, mm = 0] = (settings.dailyTime ?? '02:00').split(':').map(Number)
    function msUntilNext(): number {
      const now = new Date()
      const next = new Date()
      next.setUTCHours(hh, mm, 0, 0)
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
      return next.getTime() - now.getTime()
    }

    function fireAndReschedule(): void {
      runScheduledLocalBackup()
      backupTimer = setTimeout(fireAndReschedule, msUntilNext()) as unknown as ReturnType<typeof setInterval>
    }

    backupTimer = setTimeout(fireAndReschedule, msUntilNext()) as unknown as ReturnType<typeof setInterval>
    log.info(`[backup] Daily backup scheduled at ${settings.dailyTime} UTC`)
  } catch (err) {
    log.warn('[backup] Failed to schedule backup (non-fatal):', err)
  }
}

app.whenReady().then(() => {
  setupIpcHandlers()
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
