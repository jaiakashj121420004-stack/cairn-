/**
 * Billing service wiring (CLAUDE.md §20). Lazily constructs the process-wide
 * {@link BillingHttpClient} pointed at the same API base URL the auth/vault clients use.
 * Tests inject a fake via {@link __setBillingClientForTests} and never touch the network.
 */
import { getApiBaseUrl } from '../session'
import { BillingHttpClient, nodeBillingFetch } from './client'
import type { BillingClient } from './client'

export { BillingHttpClient, nodeBillingFetch } from './client'
export type { BillingClient, BillingFetchLike } from './client'

let client: BillingClient | null = null

/** The process-wide {@link BillingClient}, constructed on first use. */
export function getBillingClient(): BillingClient {
  if (client === null) {
    client = new BillingHttpClient({ baseUrl: getApiBaseUrl(), fetchImpl: nodeBillingFetch })
  }
  return client
}

/** Test seam: replace the singleton (or reset with null). */
export function __setBillingClientForTests(fake: BillingClient | null): void {
  client = fake
}
