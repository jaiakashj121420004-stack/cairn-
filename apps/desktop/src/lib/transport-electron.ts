// Forwards `Transport.call` over the existing typed IPC bridge (CLAUDE.md §3.6,
// Stage 18.7). This is the ONLY file (besides `preload.ts`, which defines it)
// permitted to reference `window.api.<namespace>` — enforced by the
// `no-restricted-syntax` ESLint rule. Everything else, including `lib/ipc.ts`,
// goes through `electronTransport`.
//
// Purely additive: zero changes to `preload.ts`, `window.api`, or any
// `electron/ipc/*` handler. The mapped-type `dispatch` table is exhaustively
// checked against `Procedures` at compile time — a missing, extra, or
// mis-typed entry is a type error, not a runtime surprise.
import type { IpcResponse } from '@shared/types/index'
import type { Procedures } from '@shared/types/index'
import type { Transport } from '@cairn/shared-types'

type Dispatch = {
  [K in keyof Procedures]: (
    input: Procedures[K]['input'],
  ) => Promise<IpcResponse<Procedures[K]['output']>>
}

const dispatch: Dispatch = {
  ping: () => window.api.ping(),
  'db:status': () => window.api.dbStatus(),

  'settings:get': (input) => window.api.settings.get(input.key),
  'settings:set': (input) => window.api.settings.set(input.key, input.value),

  'propFirms:list': () => window.api.propFirms.list(),
  'propFirms:create': (input) => window.api.propFirms.create(input),
  'propFirms:update': (input) => window.api.propFirms.update(input),

  'accountTemplates:list': () => window.api.accountTemplates.list(),
  'accountTemplates:create': (input) => window.api.accountTemplates.create(input),
  'accountTemplates:update': (input) => window.api.accountTemplates.update(input),

  'accounts:list': () => window.api.accounts.list(),
  'accounts:create': (input) => window.api.accounts.create(input),
  'accounts:update': (input) => window.api.accounts.update(input),
  'accounts:stats': () => window.api.accounts.stats(),
  'accounts:delete': (input) => window.api.accounts.delete(input.id),

  'pairs:list': () => window.api.pairs.list(),
  'pairs:create': (input) => window.api.pairs.create(input),
  'pairs:update': (input) => window.api.pairs.update(input),

  'setups:list': () => window.api.setups.list(),
  'setups:create': (input) => window.api.setups.create(input),
  'setups:update': (input) => window.api.setups.update(input),

  'killzones:list': () => window.api.killzones.list(),
  'killzones:create': (input) => window.api.killzones.create(input),
  'killzones:update': (input) => window.api.killzones.update(input),

  'paths:pickFolder': () => window.api.paths.pickFolder(),
  'paths:pickImages': () => window.api.paths.pickImages(),
  'paths:openFile': (input) => window.api.paths.openFile(input.filePath),

  'data:openFolder': () => window.api.data.openFolder(),
  'data:export': () => window.api.data.export(),
  'data:exportPdf': (input) => window.api.data.exportPdf(input.defaultName),
  'data:reset': (input) => window.api.data.reset(input.ack),

  'rules:evaluatePreTrade': (input) => window.api.rules.evaluatePreTrade(input),
  'rules:evaluateModification': (input) => window.api.rules.evaluateModification(input),
  'rules:getSessionState': (input) => window.api.rules.getSessionState(input.accountId),
  'rules:override': (input) => window.api.rules.override(input),
  'rules:clearCooldown': (input) => window.api.rules.clearCooldown(input.id, input.ack),
  'rules:onTradeClosed': (input) => window.api.rules.onTradeClosed(input.tradeId),
  'rules:detectCloseViolations': (input) => window.api.rules.detectCloseViolations(input.tradeId),
  'rules:listAvailable': () => window.api.rules.listAvailable(),

  'accountRules:list': (input) => window.api.accountRules.list(input.accountId),
  'accountRules:upsert': (input) => window.api.accountRules.upsert(input),

  'sessions:getToday': (input) => window.api.sessions.getToday(input.accountId),
  'sessions:upsert': (input) => window.api.sessions.upsert(input),
  'sessions:lock': (input) => window.api.sessions.lock(input.sessionId),

  'trades:create': (input) => window.api.trades.create(input),
  'trades:setOpen': (input) => window.api.trades.setOpen(input.tradeId, input.accountId),
  'trades:close': (input) => window.api.trades.close(input),
  'trades:closeMinimal': (input) => window.api.trades.closeMinimal(input),
  'trades:completePhase2': (input) => window.api.trades.completePhase2(input),
  'trades:partialClose': (input) => window.api.trades.partialClose(input),
  'trades:list': (input) => window.api.trades.list(input),
  'trades:listAwaitingReflection': (input) =>
    window.api.trades.listAwaitingReflection(input.accountId),
  'trades:countAwaitingReflection': (input) =>
    window.api.trades.countAwaitingReflection(input.accountId),
  'trades:get': (input) => window.api.trades.get(input.tradeId),
  'trades:delete': (input) => window.api.trades.delete(input.tradeId),
  'trades:addScreenshot': (input) =>
    window.api.trades.addScreenshot(input.tradeId, input.kind, input.sourcePath, input.caption),
  'trades:pickScreenshots': (input) => window.api.trades.pickScreenshots(input.tradeId),
  'trades:listScreenshots': (input) => window.api.trades.listScreenshots(input.tradeId),
  'trades:deleteScreenshot': (input) => window.api.trades.deleteScreenshot(input.screenshotId),

  'dashboard:getStats': (input) => window.api.dashboard.getStats(input.accountId),

  'analytics:performance': (input) => window.api.analytics.performance(input.filter),
  'analytics:adherence': (input) => window.api.analytics.adherence(input.filter),
  'analytics:setups': (input) => window.api.analytics.setups(input.filter),
  'analytics:behavioral': (input) => window.api.analytics.behavioral(input.filter),
  'analytics:phases': () => window.api.analytics.phases(),
  'analytics:derived': (input) => window.api.analytics.derived(input.filter),
  'analytics:listReviews': (input) => window.api.analytics.listReviews(input.accountId),
  'analytics:createReview': (input) => window.api.analytics.createReview(input),
  'analytics:playbooks': (input) => window.api.analytics.playbookStats(input.filter),

  'playbooks:list': (input) => window.api.playbooks.list(input.accountId),
  'playbooks:get': (input) => window.api.playbooks.get(input.id),
  'playbooks:create': (input) => window.api.playbooks.create(input),
  'playbooks:update': (input) => window.api.playbooks.update(input),
  'playbooks:delete': (input) => window.api.playbooks.delete(input.id),

  'backup:getSettings': () => window.api.backup.getSettings(),
  'backup:setSettings': (input) => window.api.backup.setSettings(input),
  'backup:pickFolder': () => window.api.backup.pickFolder(),
  'backup:now': () => window.api.backup.now(),
  'backup:nowToFolder': () => window.api.backup.nowToFolder(),
  'backup:getLog': () => window.api.backup.getLog(),
  'backup:pickRestoreFile': () => window.api.backup.pickRestoreFile(),
  'backup:restore': (input) => window.api.backup.restore(input.path, input.ack),
  'backup:reschedule': () => window.api.backup.reschedule(),

  'insights:list': (input) => window.api.insights.list(input.accountId),
  'insights:dismiss': (input) => window.api.insights.dismiss(input.accountId, input.insightId),

  'notebook:list': () => window.api.notebook.list(),
  'notebook:search': (input) => window.api.notebook.search(input),
  'notebook:get': (input) => window.api.notebook.get(input.id),
  'notebook:create': (input) => window.api.notebook.create(input),
  'notebook:update': (input) => window.api.notebook.update(input),
  'notebook:delete': (input) => window.api.notebook.delete(input.id),

  'import:previewMt5': (input) => window.api.import.previewMt5(input),
  'import:commitMt5': (input) => window.api.import.commitMt5(input),
  'import:previewCtrader': (input) => window.api.import.previewCtrader(input),
  'import:commitCtrader': (input) => window.api.import.commitCtrader(input),
  'import:previewTradingView': (input) => window.api.import.previewTradingView(input),
  'import:commitTradingView': (input) => window.api.import.commitTradingView(input),

  'sync:now': () => window.api.sync.now(),
  'sync:status': () => window.api.sync.status(),
  'sync:conflicts:list': () => window.api.sync.listConflicts(),
  'sync:conflicts:count': () => window.api.sync.countConflicts(),
  'sync:conflicts:resolve': (input) => window.api.sync.resolveConflict(input),

  'vault:status': () => window.api.vault.status(),
  'vault:unlock': (input) => window.api.vault.unlock(input.password),
  'vault:recover': (input) => window.api.vault.recover(input.phrase, input.newPassword),
  'vault:lock': () => window.api.vault.lock(),

  'broker:status': () => window.api.broker.status(),
  'broker:getMt5Config': () => window.api.broker.getMt5Config(),
  'broker:getCtraderConfig': () => window.api.broker.getCtraderConfig(),
  'broker:ctraderConnect': () => window.api.broker.ctraderConnect(),
  'broker:ctraderDisconnect': () => window.api.broker.ctraderDisconnect(),
  'broker:ctraderSetEnvironment': (input) => window.api.broker.ctraderSetEnvironment(input),
  'broker:listAccountMap': () => window.api.broker.listAccountMap(),
  'broker:listUnmappedAccounts': () => window.api.broker.listUnmappedAccounts(),
  'broker:setAccountMap': (input) => window.api.broker.setAccountMap(input),
  'broker:deleteAccountMap': (input) => window.api.broker.deleteAccountMap(input),

  'auth:signup': (input) => window.api.auth.signup(input),
  'auth:login': (input) => window.api.auth.login(input),
  'auth:logout': () => window.api.auth.logout(),
  'auth:getSession': () => window.api.auth.getSession(),
  'auth:restore': () => window.api.auth.restore(),
  'auth:verifyEmail': (input) => window.api.auth.verifyEmail(input.token),
  'auth:forgotPassword': (input) => window.api.auth.forgotPassword(input),
  'auth:resetPassword': (input) => window.api.auth.resetPassword(input),

  'billing:status': () => window.api.billing.status(),
  'billing:checkout': (input) => window.api.billing.checkout(input),
  'billing:portal': () => window.api.billing.portal(),
  'billing:cancel': (input) => window.api.billing.cancel(input),
}

export const electronTransport: Transport<Procedures> = {
  call: (name, input) => dispatch[name](input),
}
