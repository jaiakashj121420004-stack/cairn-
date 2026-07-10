// @vitest-environment node
//
// Unit test: one-click MT5 EA installer (Wave 4 — docs/broker-integration.md §2.1).
//
// Covers installMt5Ea copying the bundled EA into every detected Experts folder
// (real temp dirs, source + targets injected), the two start-blocked error branches
// (bundled EA missing / no terminal found), the optional compiled .ex5, per-folder
// failure isolation, that destinations default to discovery (never the renderer),
// and revealMt5ExpertsFolder's path allow-list (the security boundary: it refuses a
// folder Cairn did not itself discover, so it is not an open-anything sink).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Hoisted so the vi.mock factories below (which run before the file body) can see them.
const h = vi.hoisted(() => ({
  discovered: [] as string[],
  openPath: vi.fn(async (_p: string): Promise<string> => ''),
}))

vi.mock('electron', () => ({ shell: { openPath: h.openPath } }))
vi.mock('../../../electron/services/broker/mt5/config', () => ({
  findMt5ExpertsPaths: (): string[] => h.discovered,
}))

import {
  installMt5Ea,
  revealMt5ExpertsFolder,
} from '../../../electron/services/broker/mt5/installer'

let root: string
let sourceDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cairn-mt5-ea-'))
  sourceDir = join(root, 'bundle')
  mkdirSync(sourceDir, { recursive: true })
  writeFileSync(join(sourceDir, 'CairnBridge.mq5'), '// EA source', 'utf8')
  h.discovered = []
  h.openPath.mockClear()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function makeExpertsDir(name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('installMt5Ea', () => {
  it('copies CairnBridge.mq5 into every detected Experts folder', () => {
    const a = makeExpertsDir('terminalA')
    const b = makeExpertsDir('terminalB')

    const res = installMt5Ea({ sourceDir, targets: [a, b] })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.installedPaths).toEqual([a, b])
    expect(res.data.failures).toEqual([])
    expect(res.data.copiedFiles).toEqual(['CairnBridge.mq5'])
    expect(readFileSync(join(a, 'CairnBridge.mq5'), 'utf8')).toBe('// EA source')
    expect(readFileSync(join(b, 'CairnBridge.mq5'), 'utf8')).toBe('// EA source')
  })

  it('also copies the compiled .ex5 when the bundle ships one', () => {
    writeFileSync(join(sourceDir, 'CairnBridge.ex5'), 'compiled', 'utf8')
    const a = makeExpertsDir('terminalA')

    const res = installMt5Ea({ sourceDir, targets: [a] })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.copiedFiles).toEqual(['CairnBridge.mq5', 'CairnBridge.ex5'])
    expect(existsSync(join(a, 'CairnBridge.ex5'))).toBe(true)
  })

  it('fails with MT5_EA_SOURCE_MISSING when the bundled EA is absent', () => {
    const res = installMt5Ea({
      sourceDir: join(root, 'nonexistent'),
      targets: [makeExpertsDir('t')],
    })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('MT5_EA_SOURCE_MISSING')
  })

  it('fails with MT5_NO_EXPERTS_FOUND when no terminal is detected', () => {
    const res = installMt5Ea({ sourceDir, targets: [] })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('MT5_NO_EXPERTS_FOUND')
  })

  it('isolates a per-folder failure without aborting the other folders', () => {
    const good = makeExpertsDir('good')
    const bad = join(root, 'missing-target') // never created → copy throws ENOENT

    const res = installMt5Ea({ sourceDir, targets: [good, bad] })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.installedPaths).toEqual([good])
    expect(res.data.failures).toHaveLength(1)
    expect(res.data.failures[0]?.path).toBe(bad)
    expect(existsSync(join(good, 'CairnBridge.mq5'))).toBe(true)
  })

  it('defaults destinations to discovery, never the renderer', () => {
    // No targets passed → falls back to findMt5ExpertsPaths() (mocked empty here).
    const res = installMt5Ea({ sourceDir })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('MT5_NO_EXPERTS_FOUND')
  })
})

describe('revealMt5ExpertsFolder', () => {
  it('rejects a path Cairn did not discover (no open-anything sink)', async () => {
    h.discovered = ['/real/experts']

    const res = await revealMt5ExpertsFolder('/etc')

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('MT5_PATH_NOT_RECOGNISED')
    expect(h.openPath).not.toHaveBeenCalled()
  })

  it('opens a discovered Experts folder', async () => {
    h.discovered = ['/real/experts']

    const res = await revealMt5ExpertsFolder('/real/experts')

    expect(res.ok).toBe(true)
    expect(h.openPath).toHaveBeenCalledWith('/real/experts')
  })

  it('surfaces an OS open failure as MT5_OPEN_FAILED', async () => {
    h.discovered = ['/real/experts']
    h.openPath.mockResolvedValueOnce('no associated application')

    const res = await revealMt5ExpertsFolder('/real/experts')

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.code).toBe('MT5_OPEN_FAILED')
  })
})
