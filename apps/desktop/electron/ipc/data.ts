import { writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join } from 'path'
import { eq, isNull, and, gte, lte } from 'drizzle-orm'
import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { app } from 'electron'
import { getDb } from '../db/index'
import * as schema from '../db/schema'
import type { IpcResponse, AccountStats } from '../../shared/types/index'

function getDataDir(): string {
  return join(app.getPath('userData'), 'cairn')
}

export function registerDataHandlers(): void {
  ipcMain.handle('data:openFolder', (): IpcResponse<void> => {
    try {
      const dir = getDataDir()
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      void shell.openPath(dir)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'OS_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('data:export', (): IpcResponse<string> => {
    try {
      const db = getDb()
      const exportDir = getDataDir()
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const outPath = join(exportDir, `cairn-export-${ts}.json`)

      const allTables = {
        settings: db.select().from(schema.settings).all(),
        propFirms: db.select().from(schema.propFirms).all(),
        accountTemplates: db.select().from(schema.accountTemplates).all(),
        accounts: db.select().from(schema.accounts).all(),
        accountRules: db.select().from(schema.accountRules).all(),
        pairs: db.select().from(schema.pairs).all(),
        setups: db.select().from(schema.setups).all(),
        killzones: db.select().from(schema.killzones).all(),
        sessions: db.select().from(schema.sessions).all(),
        trades: db.select().from(schema.trades).all(),
        ruleViolations: db.select().from(schema.ruleViolations).all(),
        reviews: db.select().from(schema.reviews).all(),
        cooldowns: db.select().from(schema.cooldowns).all(),
        notebookEntries: db.select().from(schema.notebookEntries).all(),
        dismissedInsights: db.select().from(schema.dismissedInsights).all(),
      }

      writeFileSync(outPath, JSON.stringify(allTables, null, 2), 'utf-8')
      return { ok: true, data: outPath }
    } catch (err) {
      return { ok: false, error: { code: 'EXPORT_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle('data:reset', (_e, raw: { ack: string }): IpcResponse<void> => {
    if (raw?.ack !== 'DELETE ALL MY DATA') {
      return {
        ok: false,
        error: { code: 'ACK_REQUIRED', message: 'Type DELETE ALL MY DATA to confirm.' },
      }
    }
    try {
      const db = getDb()
      const dir = getDataDir()
      const dbPath = join(dir, 'journal.db')

      // Backup first
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = join(dir, `pre-reset-backup-${ts}.db`)
      if (existsSync(dbPath)) copyFileSync(dbPath, backupPath)

      // Delete all rows in dependency order (children first)
      db.transaction(() => {
        db.delete(schema.notebookEntries).run()
        db.delete(schema.dismissedInsights).run()
        db.delete(schema.ruleViolations).run()
        db.delete(schema.cooldowns).run()
        db.delete(schema.reviews).run()
        db.delete(schema.trades).run()
        db.delete(schema.sessions).run()
        db.delete(schema.accountRules).run()
        db.delete(schema.accounts).run()
        db.delete(schema.accountTemplates).run()
        db.delete(schema.pairs).run()
        db.delete(schema.setups).run()
        db.delete(schema.killzones).run()
        db.delete(schema.propFirms).run()
        db.delete(schema.backupLog).run()
        // Preserve settings (theme etc) — only reset the data
        db.update(schema.settings)
          .set({ value: JSON.stringify(false), updatedAt: Date.now() })
          .where(eq(schema.settings.key, 'onboarding_completed'))
          .run()
      })

      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'RESET_ERROR', message: String(err) } }
    }
  })

  ipcMain.handle(
    'data:exportPdf',
    async (_e, raw: { defaultName?: string }): Promise<IpcResponse<string>> => {
      try {
        const win = BrowserWindow.getFocusedWindow()
        if (!win) {
          return { ok: false, error: { code: 'NO_WINDOW', message: 'No focused window found.' } }
        }
        const result = await dialog.showSaveDialog(win, {
          title: 'Save PDF',
          defaultPath: join(app.getPath('documents'), raw?.defaultName ?? 'cairn-export.pdf'),
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (result.canceled || !result.filePath) return { ok: true, data: '' }
        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          landscape: true,
        })
        writeFileSync(result.filePath, pdfBuffer)
        return { ok: true, data: result.filePath }
      } catch (err) {
        return { ok: false, error: { code: 'PDF_ERROR', message: String(err) } }
      }
    },
  )

  ipcMain.handle('accounts:stats', (): IpcResponse<AccountStats[]> => {
    try {
      const db = getDb()
      const accounts = db
        .select()
        .from(schema.accounts)
        .where(isNull(schema.accounts.deletedAt))
        .all()
      const now = Date.now()
      const todayStart = new Date(now)
      todayStart.setUTCHours(0, 0, 0, 0)

      const stats: AccountStats[] = accounts.map((acct) => {
        const trades = db
          .select()
          .from(schema.trades)
          .where(and(eq(schema.trades.accountId, acct.id), isNull(schema.trades.deletedAt)))
          .all()

        const closedTrades = trades.filter((t) => t.status === 'closed')
        const tradeCount = closedTrades.length
        const cleanCount = closedTrades.filter((t) => t.isClean === 1).length
        const cleanRate = tradeCount > 0 ? Math.round((cleanCount / tradeCount) * 10000) : 0

        const todayTrades = db
          .select()
          .from(schema.trades)
          .where(
            and(
              eq(schema.trades.accountId, acct.id),
              isNull(schema.trades.deletedAt),
              gte(schema.trades.createdAt, todayStart.getTime()),
              lte(schema.trades.createdAt, now),
            ),
          )
          .all()

        const dailyPnlCents = todayTrades
          .filter((t) => t.status === 'closed' && t.pnlCents !== null)
          .reduce((sum, t) => sum + (t.pnlCents ?? 0), 0)

        const totalPnlCents = closedTrades.reduce((sum, t) => sum + (t.pnlCents ?? 0), 0)

        const daysSinceStart = Math.floor((now - acct.startDate) / 86_400_000)

        const initialEquity = acct.accountSizeCents
        const ddUsedCents = Math.max(0, initialEquity - acct.currentEquityCents)
        const ddUsedBps = Math.round((ddUsedCents / initialEquity) * 10000)

        const profitGain = acct.peakEquityCents - initialEquity
        const profitPctBps = Math.round((profitGain / initialEquity) * 10000)

        return {
          accountId: acct.id,
          tradeCount,
          cleanCount,
          cleanRate,
          daysSinceStart,
          dailyPnlCents,
          totalPnlCents,
          ddUsedBps,
          profitPctBps,
        }
      })

      return { ok: true, data: stats }
    } catch (err) {
      return { ok: false, error: { code: 'DB_ERROR', message: String(err) } }
    }
  })
}
