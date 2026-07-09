import {
  DEFAULT_KDF_PARAMS,
  deriveKEK,
  encryptRecord,
  generateDataKey,
  generateRecoveryPhrase,
  generateSalt,
  initCrypto,
  keyFromRecoveryPhrase,
  memzero,
  wrapDataKey,
} from '@cairn/shared-crypto'
import { ERROR_CODES, err, ok, type Result } from '@cairn/shared-types'
import {
  vaultKeyOutputSchema,
  vaultKeyPutOutputSchema,
  vaultPullOutputSchema,
  type VaultKeyOutput,
  type WrappedKeyWire,
} from '@cairn/shared-zod'
import { adFor, bytesToBase64, encodeCiphertext } from './vault-codec'
import { decryptOpPayload, unlockWithPassword, unlockWithRecoveryPhrase } from './vault-crypto'
import type { HttpCore } from './http-core'
import type { VaultCache } from './vault-cache'
import type { WrappedKey } from '@cairn/shared-types'

function toWrappedWire(w: WrappedKey): WrappedKeyWire {
  return {
    algorithm: w.algorithm,
    nonce: bytesToBase64(w.nonce),
    ciphertext: bytesToBase64(w.ciphertext),
  }
}

/**
 * The web vault session (CLAUDE.md §2.4, §18.6, task §4/§5). Holds the unwrapped data
 * key in memory for the unlocked session, fetches the key descriptor and encrypted ops
 * from the server, decrypts in-browser, and lands plaintext in the IndexedDB cache.
 *
 * Memory hygiene: the data key is a single `Uint8Array`. `lock()`/`logout()` zero it via
 * `memzero` so the plaintext key does not linger after the session ends (§2.13).
 */
export class WebVault {
  private dataKey: Uint8Array | null = null
  private descriptor: VaultKeyOutput | null = null

  constructor(
    private readonly core: HttpCore,
    private readonly cache: VaultCache,
  ) {}

  isUnlocked(): boolean {
    return this.dataKey !== null
  }

  /**
   * First-time enrollment (CLAUDE.md §18.4; docs/security.md §3–§5). Generates a fresh
   * data key and a 24-word recovery phrase, wraps the data key under BOTH the
   * password-derived KEK and the recovery-phrase-derived KEK, and uploads only the
   * wrapped copies + salt + KDF params via `PUT /vault/key`. The plaintext data key and
   * both KEKs never leave the browser; the server stores ciphertext only.
   *
   * Returns the recovery phrase to display exactly once — Cairn never stores it and
   * cannot show it again. The vault is left unlocked (data key held in memory).
   */
  async enroll(password: string): Promise<Result<{ recoveryPhrase: readonly string[] }>> {
    await initCrypto()
    const dataKey = generateDataKey()
    const { phrase } = generateRecoveryPhrase()

    const salt = generateSalt()
    const passwordKek = await deriveKEK(password, salt, DEFAULT_KDF_PARAMS)
    const recoveryKek = await keyFromRecoveryPhrase(phrase)
    try {
      const wrapped = wrapDataKey(dataKey, passwordKek)
      const recoveryWrapped = wrapDataKey(dataKey, recoveryKek)
      const res = await this.core.call<unknown>('PUT', '/vault/key', {
        wrapped_data_key: toWrappedWire(wrapped),
        recovery_wrapped_data_key: toWrappedWire(recoveryWrapped),
        kdf_salt: bytesToBase64(salt),
        kdf: {
          algorithm: DEFAULT_KDF_PARAMS.algorithm,
          ops_limit: DEFAULT_KDF_PARAMS.opsLimit,
          mem_limit_bytes: DEFAULT_KDF_PARAMS.memLimitBytes,
          key_length_bytes: DEFAULT_KDF_PARAMS.keyLengthBytes,
        },
      })
      if (!res.ok) return res
      if (!vaultKeyPutOutputSchema.safeParse(res.data).success) {
        return err(ERROR_CODES.INTERNAL, 'malformed enrollment response')
      }
      this.descriptor = null // force a fresh GET /vault/key next unlock
      this.setDataKey(dataKey)
      return ok({ recoveryPhrase: phrase })
    } finally {
      memzero(passwordKek)
      memzero(recoveryKek)
    }
  }

  /**
   * Whether this user's vault is enrolled on the server (a key descriptor exists).
   * `NOT_FOUND` ⇒ not enrolled (first device); any other error is surfaced.
   */
  async isEnrolled(): Promise<Result<boolean>> {
    const res = await this.core.call<unknown>('GET', '/vault/key')
    if (res.ok) return ok(true)
    if (res.error.code === ERROR_CODES.NOT_FOUND) return ok(false)
    return res
  }

  /** Fetch (and memoize) the client-side unlock descriptor. 404 ⇒ vault not enrolled. */
  private async loadDescriptor(): Promise<Result<VaultKeyOutput>> {
    if (this.descriptor !== null) return ok(this.descriptor)
    const res = await this.core.call<unknown>('GET', '/vault/key')
    if (!res.ok) return res
    const parsed = vaultKeyOutputSchema.safeParse(res.data)
    if (!parsed.success) {
      return err(ERROR_CODES.INTERNAL, 'malformed vault key descriptor')
    }
    this.descriptor = parsed.data
    return ok(parsed.data)
  }

  /** Unlock the vault with the account password. WRONG_KEY ⇒ wrong password. */
  async unlock(password: string): Promise<Result<{ keyVersion: number }>> {
    const desc = await this.loadDescriptor()
    if (!desc.ok) return desc
    try {
      const key = await unlockWithPassword(password, desc.data)
      this.setDataKey(key)
      return ok({ keyVersion: desc.data.key_version })
    } catch (e) {
      return err(ERROR_CODES.INVALID_CREDENTIALS, wrongKeyMessage(e))
    }
  }

  /** Unlock via the 24-word recovery phrase (new device / after password reset). */
  async recover(phrase: readonly string[]): Promise<Result<{ keyVersion: number }>> {
    const desc = await this.loadDescriptor()
    if (!desc.ok) return desc
    try {
      const key = await unlockWithRecoveryPhrase(phrase, desc.data)
      this.setDataKey(key)
      return ok({ keyVersion: desc.data.key_version })
    } catch (e) {
      return err(ERROR_CODES.INVALID_TOKEN, wrongKeyMessage(e))
    }
  }

  /**
   * Pull every new encrypted op since the cached cursor, decrypt each in-browser, and
   * apply it to the IndexedDB cache. Returns the number of ops applied. Read-only sync:
   * the web client does not push in this stage (offline writes are disallowed by design,
   * task §5 — they would conflict with the sync model).
   */
  async pull(): Promise<Result<{ applied: number }>> {
    if (this.dataKey === null) return err(ERROR_CODES.FORBIDDEN, 'vault is locked')
    const dataKey = this.dataKey
    const meta = await this.cache.getMeta()
    const appliedPerTable = { ...meta.appliedOpIdPerTable }
    let cursor: number | undefined
    let applied = 0

    // Paginate until the server reports no further pages.
    for (;;) {
      const body =
        cursor === undefined ? { since_op_id_per_table: appliedPerTable } : { since_id: cursor }
      const res = await this.core.call<unknown>('POST', '/vault/pull', body)
      if (!res.ok) return res
      const page = vaultPullOutputSchema.safeParse(res.data)
      if (!page.success) return err(ERROR_CODES.INTERNAL, 'malformed pull response')

      for (const op of page.data.ops) {
        const deleted = op.op_type === 'delete'
        const data = deleted ? {} : decryptOpPayload(op, dataKey)
        await this.cache.applyRecord({
          tableName: op.table_name,
          recordId: op.record_id,
          data,
          opId: op.id,
          deleted,
        })
        appliedPerTable[op.table_name] = Math.max(appliedPerTable[op.table_name] ?? 0, op.id)
        applied += 1
      }

      if (page.data.next_cursor === null) break
      cursor = page.data.next_cursor
    }

    await this.cache.setMeta({
      appliedOpIdPerTable: appliedPerTable,
      keyVersion: this.descriptor?.key_version ?? meta.keyVersion,
    })
    return ok({ applied })
  }

  /** Zero the in-memory data key. The IndexedDB cache is left intact (offline reads). */
  lock(): void {
    if (this.dataKey !== null) {
      memzero(this.dataKey)
      this.dataKey = null
    }
  }

  /** Full sign-out: lock the key AND wipe the decrypted cache (§2.13). */
  async logout(): Promise<void> {
    this.lock()
    this.descriptor = null
    await this.cache.clear()
  }

  /**
   * TEST-ONLY. Encrypt a record under the current data key and return a wire op, so the
   * Playwright suite can seed encrypted server state that a second device then pulls and
   * decrypts (proving cross-device E2E). Never called by product code — `main.tsx` only
   * wires the `window.__cairnTest` hook under `import.meta.env.DEV`. Returns null when the
   * vault is locked.
   */
  encryptForTest(
    tableName: string,
    recordId: string,
    data: Record<string, unknown>,
  ): {
    table_name: string
    record_id: string
    op_type: 'upsert'
    payload_ciphertext: string
  } | null {
    if (this.dataKey === null) return null
    const plaintext = new TextEncoder().encode(JSON.stringify(data))
    // Reuse the same AEAD + AD convention the real pull/decrypt path uses.
    const record = encryptRecord(plaintext, this.dataKey, adFor(tableName, recordId))
    return {
      table_name: tableName,
      record_id: recordId,
      op_type: 'upsert',
      payload_ciphertext: encodeCiphertext(record),
    }
  }

  private setDataKey(key: Uint8Array): void {
    if (this.dataKey !== null) memzero(this.dataKey)
    this.dataKey = key
  }
}

function wrongKeyMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'failed to unwrap data key'
}
