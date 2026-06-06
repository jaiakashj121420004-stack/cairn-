/**
 * Vault enrollment + unlock service (CLAUDE.md §2.4/§2.13/§18.4; docs/security.md §3–§5).
 *
 * Bridges the auth session to the encrypted vault. Two entry points:
 *
 *  - {@link VaultEnroller.unlock} — runs once per (device, account) after a password is
 *    entered. It either ENROLLS a brand-new vault (no descriptor on the server yet) or
 *    UNLOCKS an existing one. Both paths end with the unwrapped data key cached in the OS
 *    keychain and this device registered, so later launches need no password.
 *  - {@link VaultEnroller.resume} — runs on every launch with no password: if the data key
 *    is still in the keychain and the device id is known locally, the vault is already
 *    unlocked; otherwise the caller must prompt for the password.
 *
 * Enrollment necessarily generates the 24-word recovery phrase here, because the server's
 * `PUT /vault/key` requires the data key wrapped under BOTH the password KEK and the
 * recovery KEK. The phrase is returned to the caller exactly once (to show the user) and is
 * never persisted, never logged, and never re-derivable from anything Cairn stores.
 *
 * Every collaborator is injected (vault client, keychain, device-id store, logger) so the
 * service unit-tests with fakes and the *real* crypto. The crypto functions themselves are
 * imported directly — they are deterministic given their inputs and have their own tests.
 */
import { err, ok } from '@cairn/shared-types'
import {
  CryptoError,
  DEFAULT_KDF_PARAMS,
  deriveKEK,
  generateDataKey,
  generateRecoveryPhrase,
  generateSalt,
  initCrypto,
  keyFromRecoveryPhrase,
  unwrapDataKey,
  wrapDataKey,
} from '../crypto'
import {
  base64ToBytes,
  bytesToBase64,
  kdfParamsToWire,
  wireToKdfParams,
  wireToWrappedKey,
  wrappedKeyToWire,
} from './vault-wire'
import type { VaultClient } from './vault-client'
import type { Result } from '@cairn/shared-types'
import type { VaultKeyOutput } from '@cairn/shared-zod'

/** Keychain operations the enroller needs — the production module fns, fakeable in tests. */
export interface VaultKeychain {
  storeDataKey(userId: string, dataKey: Uint8Array): Promise<Result<void>>
  readDataKey(userId: string): Promise<Result<Uint8Array | null>>
  clearDataKey(userId: string): Promise<Result<boolean>>
}

/**
 * Local persistence for this device's enrolled id, keyed by user. Non-secret (the id is a
 * UUID the server already holds), so it lives in the `settings` table, not the keychain.
 * Persisted so each launch reuses the same device rather than registering a new one.
 */
export interface DeviceIdStore {
  load(userId: string): string | null
  save(userId: string, deviceId: string): void
  clear(userId: string): void
}

/** Minimal logger seam (defaults to no-op so the service stays free of electron-log in tests). */
export interface EnrollLogger {
  warn(msg: string, meta?: unknown): void
}

const NOOP_LOGGER: EnrollLogger = { warn: () => undefined }

export interface VaultEnrollerDeps {
  readonly client: VaultClient
  readonly keychain: VaultKeychain
  readonly devices: DeviceIdStore
  readonly log?: EnrollLogger
}

/** Inputs for an unlock/enroll attempt. `deviceName`/`platform` label the device server-side. */
export interface UnlockParams {
  readonly userId: string
  readonly password: string
  readonly accessToken: string
  readonly deviceName: string
  readonly platform: string
}

/**
 * Inputs for a recovery attempt: the user lost their vault password and is unlocking with
 * the 24-word recovery phrase, then setting a NEW password. The phrase itself is unchanged
 * (the same recovery-wrapped key is preserved), so it keeps working afterwards.
 */
export interface RecoverParams {
  readonly userId: string
  readonly accessToken: string
  /** The 24 BIP-39 words (validated before any key derivation). */
  readonly phrase: readonly string[]
  /** The new vault password to re-wrap the data key under. */
  readonly newPassword: string
  readonly deviceName: string
  readonly platform: string
}

/** Outcome of {@link VaultEnroller.unlock}. `recoveryPhrase` is present only on first enrollment. */
export interface VaultUnlockResult {
  readonly deviceId: string
  readonly dataKey: Uint8Array
  readonly enrolled: boolean
  /** The 24-word phrase to show the user once, on first enrollment only. */
  readonly recoveryPhrase?: readonly string[]
}

/** Outcome of {@link VaultEnroller.resume}: either already unlocked, or a password is needed. */
export type VaultResumeResult =
  | { readonly status: 'unlocked'; readonly deviceId: string; readonly dataKey: Uint8Array }
  | { readonly status: 'needs-password' }

/**
 * The vault-enrollment surface the {@link SessionStore} depends on. An interface (not the
 * concrete class) so the store can be unit-tested with a fake — `VaultEnroller` has private
 * fields and so is not structurally assignable on its own.
 */
export interface VaultEnrollment {
  unlock(params: UnlockParams): Promise<Result<VaultUnlockResult>>
  recover(params: RecoverParams): Promise<Result<VaultUnlockResult>>
  resume(params: { userId: string }): Promise<VaultResumeResult>
  forget(userId: string): Promise<void>
}

export class VaultEnroller implements VaultEnrollment {
  private readonly client: VaultClient
  private readonly keychain: VaultKeychain
  private readonly devices: DeviceIdStore
  private readonly log: EnrollLogger

  constructor(deps: VaultEnrollerDeps) {
    this.client = deps.client
    this.keychain = deps.keychain
    this.devices = deps.devices
    this.log = deps.log ?? NOOP_LOGGER
  }

  /** Enroll a new vault or unlock an existing one with the user's password. */
  async unlock(params: UnlockParams): Promise<Result<VaultUnlockResult>> {
    const keyRes = await this.client.getVaultKey(params.accessToken)
    if (!keyRes.ok) return keyRes
    await initCrypto()
    return keyRes.data === null ? this.enroll(params) : this.unlockExisting(params, keyRes.data)
  }

  /**
   * Recover a vault when the password is lost: unwrap the data key with the recovery phrase,
   * re-wrap it under a NEW password KEK (fresh salt), and upload. The recovery-wrapped key is
   * preserved so the same phrase keeps working. The data key — and thus every record
   * ciphertext — is unchanged (docs/security.md §8). On success the vault is unlocked, the
   * key cached, and this device registered.
   */
  async recover(params: RecoverParams): Promise<Result<VaultUnlockResult>> {
    const keyRes = await this.client.getVaultKey(params.accessToken)
    if (!keyRes.ok) return keyRes
    if (keyRes.data === null) {
      // No vault to recover — there is nothing the phrase can unwrap.
      return err('NOT_FOUND', 'no vault is enrolled for this account')
    }
    const descriptor = keyRes.data
    await initCrypto()

    let recoveryKek: Uint8Array
    try {
      recoveryKek = await keyFromRecoveryPhrase(params.phrase)
    } catch (e) {
      // An invalid/mistyped phrase fails the BIP-39 checksum before any derivation.
      if (e instanceof CryptoError && e.code === 'INVALID_RECOVERY_PHRASE') {
        return err('INVALID_RECOVERY_PHRASE', 'that recovery phrase is not valid')
      }
      throw e
    }

    let dataKey: Uint8Array
    try {
      dataKey = unwrapDataKey(wireToWrappedKey(descriptor.recovery_wrapped_data_key), recoveryKek)
    } catch (e) {
      // A valid-checksum phrase that still won't unwrap is simply the wrong phrase.
      if (e instanceof CryptoError && e.code === 'WRONG_KEY') {
        return err('WRONG_KEY', 'that recovery phrase does not match this vault')
      }
      throw e
    }

    // Re-wrap the SAME data key under a fresh password KEK + salt; keep the recovery key.
    const salt = generateSalt()
    const kek = await deriveKEK(params.newPassword, salt, DEFAULT_KDF_PARAMS)
    const wrapped = wrapDataKey(dataKey, kek)

    const putRes = await this.client.putVaultKey(
      {
        wrapped_data_key: wrappedKeyToWire(wrapped),
        recovery_wrapped_data_key: descriptor.recovery_wrapped_data_key,
        kdf_salt: bytesToBase64(salt),
        kdf: kdfParamsToWire(DEFAULT_KDF_PARAMS),
      },
      params.accessToken,
    )
    if (!putRes.ok) return putRes

    const deviceRes = await this.ensureDevice({
      userId: params.userId,
      password: params.newPassword,
      accessToken: params.accessToken,
      deviceName: params.deviceName,
      platform: params.platform,
    })
    if (!deviceRes.ok) return deviceRes

    await this.cacheDataKey(params.userId, dataKey)
    return ok({ deviceId: deviceRes.data, dataKey, enrolled: false })
  }

  /**
   * Drop the cached data key for `userId` from the keychain (on lock / logout). The device
   * id persistence is intentionally left intact so a re-login reuses the same device rather
   * than registering a duplicate. Best-effort: a keychain failure is logged, not surfaced.
   */
  async forget(userId: string): Promise<void> {
    const cleared = await this.keychain.clearDataKey(userId)
    if (!cleared.ok) this.log.warn('[vault] failed to clear cached data key', cleared.error.code)
  }

  /** Resume without a password if the data key is still cached and the device id is known. */
  async resume(params: { userId: string }): Promise<VaultResumeResult> {
    const deviceId = this.devices.load(params.userId)
    if (deviceId === null) return { status: 'needs-password' }
    const dk = await this.keychain.readDataKey(params.userId)
    if (!dk.ok || dk.data === null) return { status: 'needs-password' }
    return { status: 'unlocked', deviceId, dataKey: dk.data }
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  /** First-time enrollment: mint a data key, wrap it under password + recovery KEKs, upload. */
  private async enroll(params: UnlockParams): Promise<Result<VaultUnlockResult>> {
    const salt = generateSalt()
    const dataKey = generateDataKey()
    const kek = await deriveKEK(params.password, salt, DEFAULT_KDF_PARAMS)

    const { phrase } = generateRecoveryPhrase()
    const recoveryKek = await keyFromRecoveryPhrase(phrase)

    const wrapped = wrapDataKey(dataKey, kek)
    const recoveryWrapped = wrapDataKey(dataKey, recoveryKek)

    const putRes = await this.client.putVaultKey(
      {
        wrapped_data_key: wrappedKeyToWire(wrapped),
        recovery_wrapped_data_key: wrappedKeyToWire(recoveryWrapped),
        kdf_salt: bytesToBase64(salt),
        kdf: kdfParamsToWire(DEFAULT_KDF_PARAMS),
      },
      params.accessToken,
    )
    if (!putRes.ok) return putRes

    const deviceRes = await this.ensureDevice(params)
    if (!deviceRes.ok) return deviceRes

    await this.cacheDataKey(params.userId, dataKey)
    return ok({ deviceId: deviceRes.data, dataKey, enrolled: true, recoveryPhrase: phrase })
  }

  /** Returning device/user: re-derive the password KEK and unwrap the stored data key. */
  private async unlockExisting(
    params: UnlockParams,
    descriptor: VaultKeyOutput,
  ): Promise<Result<VaultUnlockResult>> {
    const salt = base64ToBytes(descriptor.kdf_salt)
    const kek = await deriveKEK(params.password, salt, wireToKdfParams(descriptor.kdf))

    let dataKey: Uint8Array
    try {
      dataKey = unwrapDataKey(wireToWrappedKey(descriptor.wrapped_data_key), kek)
    } catch (e) {
      // A tag mismatch IS the wrong-password signal. Never log the password or the KEK.
      if (e instanceof CryptoError && e.code === 'WRONG_KEY') {
        return err('WRONG_KEY', 'incorrect password')
      }
      throw e
    }

    const deviceRes = await this.ensureDevice(params)
    if (!deviceRes.ok) return deviceRes

    await this.cacheDataKey(params.userId, dataKey)
    return ok({ deviceId: deviceRes.data, dataKey, enrolled: false })
  }

  /** Reuse this device's persisted id, or register once and persist it. */
  private async ensureDevice(params: UnlockParams): Promise<Result<string>> {
    const existing = this.devices.load(params.userId)
    if (existing !== null) return ok(existing)

    const reg = await this.client.registerDevice(
      { name: params.deviceName, platform: params.platform },
      params.accessToken,
    )
    if (!reg.ok) return reg
    this.devices.save(params.userId, reg.data.device.id)
    return ok(reg.data.device.id)
  }

  /** Cache the unwrapped data key for keyless subsequent launches. Non-fatal on failure. */
  private async cacheDataKey(userId: string, dataKey: Uint8Array): Promise<void> {
    const cached = await this.keychain.storeDataKey(userId, dataKey)
    if (!cached.ok) {
      // The session still works this run; only password-free resume is lost (common on Linux
      // without libsecret). Log the code only — never key material.
      this.log.warn('[vault] failed to cache data key in keychain', cached.error.code)
    }
  }
}
