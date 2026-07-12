import { createHmac, timingSafeEqual } from 'node:crypto'
import { ERROR_CODES } from '@cairn/shared-types'
import { AppError } from '../lib/errors'
import type { IncomingHttpHeaders } from 'node:http'

/**
 * Dodo Payments webhook signature verification (CLAUDE.md §2.13, §20.4).
 *
 * Dodo follows the Standard Webhooks spec (https://standardwebhooks.com): three headers —
 * `webhook-id`, `webhook-timestamp`, `webhook-signature` — and an HMAC-SHA256 over
 * `${id}.${timestamp}.${rawBody}` keyed by the (base64) signing secret. The secret is
 * delivered as `whsec_<base64>`; the key bytes are the base64-decoded remainder.
 *
 * This is the ONE place the signature is checked, shared by the webhook route and the
 * provider's `verifyWebhook`, so the two can never diverge. It never reads the DB or trusts
 * the body before the HMAC checks out. Any failure is a `VALIDATION_FAILED` (⇒ 400).
 */

/** Max allowed skew between `webhook-timestamp` and now — blunts replay of captured deliveries. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export interface DodoSignatureHeaders {
  readonly id: string
  readonly timestamp: string
  readonly signature: string
}

/** Pull the three Standard Webhooks headers, or throw if any is missing/blank. */
export function readDodoHeaders(headers: IncomingHttpHeaders): DodoSignatureHeaders {
  const id = headers['webhook-id']
  const timestamp = headers['webhook-timestamp']
  const signature = headers['webhook-signature']
  if (typeof id !== 'string' || typeof timestamp !== 'string' || typeof signature !== 'string') {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'missing dodo webhook signature headers')
  }
  return { id, timestamp, signature }
}

/** Decode a Standard Webhooks secret (`whsec_<base64>` or raw base64) to raw key bytes. */
function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(raw, 'base64')
}

/**
 * Verify a Dodo webhook signature over `rawBody`. Returns the parsed headers (the
 * `webhook-id` doubles as the idempotency external id) on success; throws
 * `VALIDATION_FAILED` on a missing header, an out-of-tolerance timestamp, or a signature
 * mismatch. Comparison is constant-time (`timingSafeEqual`).
 */
export function verifyDodoSignature(
  rawBody: Buffer,
  headers: IncomingHttpHeaders,
  secret: string,
): DodoSignatureHeaders {
  const parts = readDodoHeaders(headers)

  const ts = Number(parts.timestamp)
  if (!Number.isFinite(ts)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid dodo webhook timestamp')
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'dodo webhook timestamp outside tolerance')
  }

  const signedContent = `${parts.id}.${parts.timestamp}.${rawBody.toString('utf8')}`
  const expected = createHmac('sha256', decodeSecret(secret)).update(signedContent).digest()

  // `webhook-signature` is a space-delimited list of `v1,<base64sig>` entries (a secret can
  // be rotated, so more than one may be present). Accept the delivery if any entry matches.
  for (const candidate of parts.signature.split(' ')) {
    const comma = candidate.indexOf(',')
    const sigPart = comma === -1 ? candidate : candidate.slice(comma + 1)
    if (sigPart.length === 0) continue
    const provided = Buffer.from(sigPart, 'base64')
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return parts
    }
  }
  throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'invalid dodo webhook signature')
}

/** Compute a Standard Webhooks `webhook-signature` header value (test/dev helper, no network). */
export function signDodoPayload(
  id: string,
  timestamp: string | number,
  rawBody: string,
  secret: string,
): string {
  const signedContent = `${id}.${String(timestamp)}.${rawBody}`
  const sig = createHmac('sha256', decodeSecret(secret)).update(signedContent).digest('base64')
  return `v1,${sig}`
}
