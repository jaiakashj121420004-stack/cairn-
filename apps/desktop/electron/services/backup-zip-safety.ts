/**
 * Zip-slip / path-traversal guard for backup restore (P1 security), split out so it is
 * pure and unit-testable without the backup service's electron/db/adm-zip imports.
 */
import { resolve, sep } from 'path'

/**
 * Reject the restore if ANY archive entry would resolve outside `destDir` (e.g. a `../`
 * or absolute `entryName`). Called before extraction so a malicious backup never writes
 * a byte outside the temp dir.
 */
export function assertZipEntriesContained(entryNames: readonly string[], destDir: string): void {
  const root = resolve(destDir)
  for (const name of entryNames) {
    const target = resolve(root, name)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`Unsafe backup archive: entry escapes target directory (${name})`)
    }
  }
}
