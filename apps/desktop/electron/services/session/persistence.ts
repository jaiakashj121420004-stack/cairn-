/**
 * Session persistence seam (CLAUDE.md §18.5, Stage 2).
 *
 * Splits what the desktop must remember across restarts into two stores by sensitivity:
 *  - the refresh token (a secret) → OS keychain;
 *  - resume metadata (`userId` + `email`, not secret) → the local `settings` table,
 *    so the next launch knows *whose* refresh token to look up.
 *
 * The interface is injected into {@link SessionStore} so unit tests use an in-memory
 * double with no keychain or SQLite. {@link createElectronSessionPersistence} is the
 * production wiring.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/index'
import * as schema from '../../db/schema'
import { clearRefreshToken, readRefreshToken, storeRefreshToken } from '../keychain'
import type { DeviceIdStore } from './enrollment'
import type { Result } from '@cairn/shared-types'

/** Non-secret info needed to resume which account to refresh on the next launch. */
export interface ResumeInfo {
  readonly userId: string
  readonly email: string
}

export interface SessionPersistence {
  /** Read the last signed-in account, or null if signed out / never signed in. */
  loadResume(): ResumeInfo | null
  /** Record the signed-in account (overwrites any prior). */
  saveResume(info: ResumeInfo): void
  /** Forget the signed-in account (logout). */
  clearResume(): void
  /** Persist the rotated refresh token. */
  saveRefreshToken(userId: string, token: string): Promise<Result<void>>
  /** Read the persisted refresh token, or `ok(null)` if none. */
  readRefreshToken(userId: string): Promise<Result<string | null>>
  /** Remove the persisted refresh token. */
  clearRefreshToken(userId: string): Promise<Result<boolean>>
}

/** Settings-table key under which the resume info JSON is stored. */
const RESUME_KEY = 'auth.resume'

/** Production persistence over the keychain (secret) and the settings table (metadata). */
export function createElectronSessionPersistence(): SessionPersistence {
  return {
    loadResume(): ResumeInfo | null {
      const row = getDb()
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, RESUME_KEY))
        .get()
      if (!row?.value) return null
      try {
        const parsed = JSON.parse(row.value) as unknown
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          typeof (parsed as ResumeInfo).userId === 'string' &&
          typeof (parsed as ResumeInfo).email === 'string'
        ) {
          return { userId: (parsed as ResumeInfo).userId, email: (parsed as ResumeInfo).email }
        }
      } catch {
        // Corrupt value — treat as no resume info rather than crashing startup.
      }
      return null
    },

    saveResume(info: ResumeInfo): void {
      const value = JSON.stringify({ userId: info.userId, email: info.email })
      getDb()
        .insert(schema.settings)
        .values({ key: RESUME_KEY, value, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value, updatedAt: Date.now() },
        })
        .run()
    },

    clearResume(): void {
      getDb().delete(schema.settings).where(eq(schema.settings.key, RESUME_KEY)).run()
    },

    saveRefreshToken: storeRefreshToken,
    readRefreshToken,
    clearRefreshToken,
  }
}

/** Settings-table key prefix under which a user's enrolled device id is stored. */
const DEVICE_KEY_PREFIX = 'vault.device.'

function deviceKey(userId: string): string {
  return `${DEVICE_KEY_PREFIX}${userId}`
}

/**
 * Production {@link DeviceIdStore} over the local `settings` table. The device id is a UUID
 * the server already holds (not a secret), so it lives alongside other non-secret app state
 * rather than in the keychain. Keyed by user so distinct accounts on one machine each keep
 * their own enrolled device.
 */
export function createElectronDeviceIdStore(): DeviceIdStore {
  return {
    load(userId: string): string | null {
      const row = getDb()
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, deviceKey(userId)))
        .get()
      return row?.value ?? null
    },

    save(userId: string, deviceId: string): void {
      getDb()
        .insert(schema.settings)
        .values({ key: deviceKey(userId), value: deviceId, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: deviceId, updatedAt: Date.now() },
        })
        .run()
    },

    clear(userId: string): void {
      getDb()
        .delete(schema.settings)
        .where(eq(schema.settings.key, deviceKey(userId)))
        .run()
    },
  }
}
