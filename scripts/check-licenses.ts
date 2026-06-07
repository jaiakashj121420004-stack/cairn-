/**
 * License gate (CLAUDE.md §2.12, §19.7, locked in §14 #25).
 *
 * Walks every materialized dependency under node_modules and fails the build if
 * any package declares a strong-copyleft license (GPL / AGPL). LGPL is permitted
 * (weak copyleft, linkable). Run via `pnpm check-licenses`; wired into CI.
 *
 * pnpm stores real package copies under node_modules/.pnpm/<name@ver>/node_modules/;
 * the top-level node_modules entries are symlinks into that store. We scan both so
 * the result is complete and we never follow symlink cycles.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** SPDX tokens that fail the build. Matched case-insensitively against each
 *  whitespace/operator-split token of the license expression. LGPL is allowed. */
const FORBIDDEN = /^(?:agpl|gpl)(?:-|$)/i

interface Offender {
  name: string
  version: string
  license: string
  path: string
}

/** Read the license expression from a package.json object. */
function licenseOf(pkg: Record<string, unknown>): string {
  if (typeof pkg.license === 'string') return pkg.license
  // Legacy { type } shape and the deprecated `licenses: [{ type }]` array.
  if (pkg.license && typeof pkg.license === 'object') {
    const type = (pkg.license as { type?: unknown }).type
    if (typeof type === 'string') return type
  }
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses
      .map((l) => (l && typeof l === 'object' ? (l as { type?: string }).type : undefined))
      .filter((t): t is string => typeof t === 'string')
      .join(' OR ')
  }
  return ''
}

/** True if any token in an SPDX expression is forbidden (and not an LGPL token). */
function isForbidden(expr: string): boolean {
  if (!expr) return false
  const tokens = expr.split(/[\s()]+|\bOR\b|\bAND\b|\bWITH\b/i).filter(Boolean)
  return tokens.some((t) => FORBIDDEN.test(t.replace(/^\(|\)$/g, '')))
}

/** Inspect a single package directory (must contain package.json). */
function inspect(pkgDir: string, offenders: Offender[]): void {
  const manifest = join(pkgDir, 'package.json')
  if (!existsSync(manifest)) return
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>
  } catch {
    return
  }
  const license = licenseOf(pkg)
  if (isForbidden(license)) {
    offenders.push({
      name: typeof pkg.name === 'string' ? pkg.name : pkgDir,
      version: typeof pkg.version === 'string' ? pkg.version : '?',
      license,
      path: pkgDir,
    })
  }
}

/** Scan the direct (and scoped) package dirs one level under a node_modules dir. */
function scanNodeModules(nmDir: string, offenders: Offender[]): void {
  if (!existsSync(nmDir)) return
  for (const entry of readdirSync(nmDir)) {
    if (entry === '.bin' || entry === '.pnpm' || entry === '.modules.yaml') continue
    const full = join(nmDir, entry)
    if (entry.startsWith('@')) {
      // Scoped: one more level down.
      for (const scoped of readdirSync(full)) {
        inspect(join(full, scoped), offenders)
      }
    } else {
      inspect(full, offenders)
    }
  }
}

function main(): void {
  const root = process.cwd()
  const offenders: Offender[] = []

  // Top-level (workspace symlinks resolve to real manifests).
  scanNodeModules(join(root, 'node_modules'), offenders)

  // pnpm content-addressed store: every real package copy lives here.
  const pnpmDir = join(root, 'node_modules', '.pnpm')
  if (existsSync(pnpmDir)) {
    for (const pkgEnv of readdirSync(pnpmDir)) {
      const inner = join(pnpmDir, pkgEnv, 'node_modules')
      if (existsSync(inner) && statSync(inner).isDirectory()) {
        scanNodeModules(inner, offenders)
      }
    }
  }

  // De-dupe by name@version (the store and top-level both surface the same pkg).
  const seen = new Set<string>()
  const unique = offenders.filter((o) => {
    const key = `${o.name}@${o.version}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (unique.length > 0) {
    process.stderr.write(
      `\nLicense check FAILED — ${unique.length} GPL/AGPL package(s) found (§19.7):\n`,
    )
    for (const o of unique) {
      process.stderr.write(`  ✗ ${o.name}@${o.version} — ${o.license}\n`)
    }
    process.stderr.write('\nGPL/AGPL transitives are not permitted. Remove or replace them.\n')
    process.exit(1)
  }

  process.stdout.write('License check passed — no GPL/AGPL dependencies found.\n')
}

main()
