/**
 * cTrader Open API configuration (Wave 4 — `docs/broker-integration.md` §2.2 / §8).
 *
 * The OAuth application credentials live in `./app-credentials` (keychain-first, with
 * an env-var fallback) — NEVER in source (CLAUDE.md §2.13 / §19; gitleaks must stay
 * clean). The redirect URI is a
 * loopback one-shot capture, matching the local-first posture: the only network
 * the OAuth dance touches is Spotware's hosted auth page (opened in the user's
 * browser) and the token endpoint.
 *
 * Read-only forever: the requested scope is the read-only `accounts` scope; the
 * `trading` scope (which would permit order execution) is never requested
 * (CLAUDE.md §14 #37).
 *
 * Main-process only: reads the SQLite `settings` table for the linked account id
 * and the selected environment.
 */

import {
  CTRADER_ACCOUNT_ID_SETTING_KEY,
  CTRADER_ENVIRONMENT_SETTING_KEY,
  parseCtraderEnvironment,
} from '@cairn/shared-types'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db/index'
import * as schema from '../../../db/schema'
import type { CtraderEnvironment } from '@cairn/shared-types'

/** Protobuf-over-TLS endpoints for the live execution stream (host:5035). */
const STREAM_HOSTS: Record<CtraderEnvironment, string> = {
  demo: 'demo.ctraderapi.com',
  live: 'live.ctraderapi.com',
}

/** TLS port for the cTrader Open API binary endpoint. */
export const CTRADER_STREAM_PORT = 5035

/** Spotware-hosted OAuth endpoints (the only HTTP the flow uses). */
export const CTRADER_AUTH_URL = 'https://openapi.ctrader.com/apps/auth'
export const CTRADER_TOKEN_URL = 'https://openapi.ctrader.com/apps/token'

/**
 * Read-only scope. `accounts` grants read access to account + execution data; it
 * does NOT grant order execution (which would need `trading`). Requesting only
 * this scope is part of the read-only safety boundary.
 */
export const CTRADER_READONLY_SCOPE = 'accounts'

/** Loopback port the one-shot OAuth redirect server binds (127.0.0.1). */
export const CTRADER_REDIRECT_PORT = 53129

/** The redirect URI registered with the Spotware application. */
export function getCtraderRedirectUri(): string {
  return `http://127.0.0.1:${CTRADER_REDIRECT_PORT}/ctrader/callback`
}

// The OAuth application credentials (client id/secret) and their keychain-first
// resolver live in `./app-credentials` (`resolveCtraderAppCredentials`,
// `isCtraderAppConfiguredAsync`). A stock install can set them in Settings (stored in
// the OS keychain); the CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET env vars remain a
// dev/CI fallback. This module keeps only the non-secret endpoints/redirect below.

function readSetting(key: string): string | null {
  const row = getDb()
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get()
  return row?.value ?? null
}

function writeSetting(key: string, jsonValue: string): void {
  const now = Date.now()
  getDb()
    .insert(schema.settings)
    .values({ key, value: jsonValue, updatedAt: now })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: jsonValue, updatedAt: now } })
    .run()
}

/** The selected environment (default demo). */
export function getCtraderEnvironment(): CtraderEnvironment {
  return parseCtraderEnvironment(readSetting(CTRADER_ENVIRONMENT_SETTING_KEY))
}

/** Persist the selected environment. */
export function setCtraderEnvironment(env: CtraderEnvironment): void {
  writeSetting(CTRADER_ENVIRONMENT_SETTING_KEY, JSON.stringify(env))
}

/** The TLS host for the selected (or given) environment. */
export function getCtraderStreamHost(env: CtraderEnvironment = getCtraderEnvironment()): string {
  return STREAM_HOSTS[env]
}

/** The linked ctidTraderAccountId, or null if none has been authorised yet. */
export function getCtraderAccountId(): number | null {
  const stored = readSetting(CTRADER_ACCOUNT_ID_SETTING_KEY)
  if (!stored) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    return typeof parsed === 'number' && Number.isInteger(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Persist the authorised account id. */
export function setCtraderAccountId(accountId: number): void {
  writeSetting(CTRADER_ACCOUNT_ID_SETTING_KEY, JSON.stringify(accountId))
}
