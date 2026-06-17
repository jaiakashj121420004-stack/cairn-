/**
 * Non-secret pseudonymization salt for the Sentry `user.id` (CLAUDE.md §18.9).
 *
 * Hashing the user's email with this salt before attaching it as `user.id` lets
 * support correlate crash reports from the same user without Sentry ever holding
 * the plaintext address. The salt is not a secret — its only purpose is to make the
 * hash specific to Cairn rather than a generic email hash — so it is safe to bake
 * into both the main and renderer bundles. Shared so main (`node:crypto` HMAC) and
 * renderer (`crypto.subtle` HMAC) produce the same `user.id` for the same email.
 */
export const SENTRY_USER_ID_SALT = 'cairn-sentry-user-id-v1'
