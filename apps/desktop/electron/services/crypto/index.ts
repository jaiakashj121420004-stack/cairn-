/**
 * Cairn client-side cryptography — desktop re-export shim (CLAUDE.md §2.4, §18.4).
 *
 * The implementation moved to `@cairn/shared-crypto` (packages/shared-crypto) so the
 * exact same code runs in the Electron main process and in-browser on web. This file
 * preserves the historical import path `electron/services/crypto` for every existing
 * desktop importer (sync engine, session enrollment, keychain, tests) — they keep
 * working unchanged. New code may import from `@cairn/shared-crypto` directly.
 *
 * NOTE (Stage 18.4): this still ships the *capability* only; no extra rows are
 * encrypted by re-exporting. The sync engine decides what is encrypted.
 */
export * from '@cairn/shared-crypto'
