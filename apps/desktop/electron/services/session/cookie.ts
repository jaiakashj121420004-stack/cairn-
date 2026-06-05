/**
 * The refresh-token cookie name — the one wire contract this client shares with the
 * server (apps/server/src/auth/cookies.ts `REFRESH_COOKIE_NAME`). The `__Host-` prefix
 * is part of the server's locked security baseline (CLAUDE.md §2.13); keep these two in
 * lock-step. Defined locally to avoid the desktop importing from the server package.
 */
export const REFRESH_COOKIE_NAME = '__Host-refresh'
